'use strict'

const { createServer } = require('node:http')
const { test, after } = require('node:test')
const { once } = require('node:events')
const { Readable, Writable } = require('node:stream')
const { strictEqual, rejects } = require('node:assert')
const { Client, interceptors, cacheStores: { MemoryCacheStore } } = require('../../index')

async function startServer (t, handler) {
  const server = createServer({ joinDuplicateHeaders: true }, handler).listen(0)
  await once(server, 'listening')
  after(() => {
    server.close()
    server.closeAllConnections()
  })
  return `http://localhost:${server.address().port}`
}

function asyncStore (store) {
  return {
    get: (key) => Promise.resolve(store.get(key)),
    createWriteStream: (key, value) => store.createWriteStream(key, value),
    delete: (key) => store.delete(key)
  }
}

async function populate (origin, store) {
  const client = new Client(origin).compose(interceptors.cache({ store }))
  after(() => client.close())
  const res = await client.request({ path: '/', method: 'GET' })
  strictEqual((await res.body.text()).length, 64)
}

test('cache hit: dump maxSize exceeded during body replay is a request error', async (t) => {
  const origin = await startServer(t, (_, res) => {
    res.setHeader('cache-control', 'public, max-age=60')
    // No content-length, so dump can only detect the overflow in onResponseData
    res.write('x'.repeat(32))
    res.end('x'.repeat(32))
  })

  const store = new MemoryCacheStore()
  await populate(origin, store)

  const client = new Client(origin)
    .compose(interceptors.cache({ store }), interceptors.dump({ maxSize: 8 }))
  after(() => client.close())

  await rejects(async () => {
    const res = await client.request({ path: '/', method: 'GET' })
    await res.body.text()
  }, { code: 'UND_ERR_ABORTED', message: /larger than maxSize/ })
})

test('cache hit from async store: dump maxSize exceeded in onResponseStart is a request error', async (t) => {
  const origin = await startServer(t, (_, res) => {
    res.setHeader('cache-control', 'public, max-age=60')
    res.end('x'.repeat(64))
  })

  const store = asyncStore(new MemoryCacheStore())
  await populate(origin, store)

  const client = new Client(origin)
    .compose(interceptors.cache({ store }), interceptors.dump({ maxSize: 8 }))
  after(() => client.close())

  await rejects(async () => {
    const res = await client.request({ path: '/', method: 'GET' })
    await res.body.text()
  }, { code: 'UND_ERR_ABORTED', message: /larger than maxSize/ })
})

test('cache hit from async store: decompress too many content-encodings on replay is a request error', async (t) => {
  const origin = await startServer(t, (_, res) => {
    res.setHeader('cache-control', 'public, max-age=60')
    // 6 codings exceeds the decompress interceptor's limit of 5. The poisoned
    // entry is written by a dispatcher without the decompress interceptor, then
    // replayed through one that has it (async store path).
    res.setHeader('content-encoding', Array(6).fill('identity').join(', '))
    res.end('x'.repeat(64))
  })

  const store = asyncStore(new MemoryCacheStore())
  await populate(origin, store)

  const client = new Client(origin)
    .compose(interceptors.cache({ store }), interceptors.decompress())
  after(() => client.close())

  await rejects(
    async () => {
      await client.request({ path: '/', method: 'GET' })
    },
    { message: /content-encoding/ }
  )
})

test('cache hit: async store get() rejection is converged to a request error', async (t) => {
  const origin = await startServer(t, (_, res) => {
    res.setHeader('cache-control', 'public, max-age=60')
    res.end('x'.repeat(64))
  })

  // A cache backend that fails on get() must not surface as an unhandled
  // promise rejection that crashes the process (async store path).
  const store = {
    get: () => Promise.reject(new Error('cache backend unavailable')),
    createWriteStream: () => {},
    delete: () => {}
  }

  const client = new Client(origin).compose(interceptors.cache({ store }))
  after(() => client.close())

  await rejects(
    async () => {
      await client.request({ path: '/', method: 'GET' })
    },
    { message: /cache backend unavailable/ }
  )
})

test('cache hit: downstream throw in onResponseEnd is reported to onResponseError', async (t) => {
  const origin = await startServer(t, (_, res) => {
    res.setHeader('cache-control', 'public, max-age=60')
    res.end('x'.repeat(64))
  })

  const store = new MemoryCacheStore()
  await populate(origin, store)

  const client = new Client(origin).compose(interceptors.cache({ store }))
  after(() => client.close())

  const boom = new Error('boom')
  const { promise, resolve } = Promise.withResolvers()

  client.dispatch({ origin, path: '/', method: 'GET' }, {
    onRequestStart () {},
    onResponseStart () {},
    onResponseData () {},
    onResponseEnd () {
      throw boom
    },
    onResponseError (_, err) {
      resolve(err)
    }
  })

  strictEqual(await promise, boom)
})

test('cache hit: downstream throw without onResponseError does not crash the process', async (t) => {
  const origin = await startServer(t, (_, res) => {
    res.setHeader('cache-control', 'public, max-age=60')
    res.end('x'.repeat(64))
  })

  const store = new MemoryCacheStore()
  await populate(origin, store)

  const client = new Client(origin).compose(interceptors.cache({ store }))
  after(() => client.close())

  const { promise, resolve } = Promise.withResolvers()

  client.dispatch({ origin, path: '/', method: 'GET' }, {
    onRequestStart () {},
    onResponseStart () {},
    onResponseData () {
      setImmediate(resolve)
      throw new Error('boom')
    }
  })

  await promise
  // Give the destroyed replay stream time to emit 'error' and 'close'
  await new Promise((resolve) => setTimeout(resolve, 20))
})

test('304 revalidation replay: dump maxSize exceeded during the cached-body replay is a request error', async (t) => {
  // The 304 path replays the cached body from CacheHandler itself (not sendCachedValue),
  // forwarding onResponseData from a later stream tick. A throwing downstream (dump over
  // maxSize) must be converged to a per-request error instead of crashing the process.
  const origin = await startServer(t, (_, res) => {
    res.writeHead(304, { 'cache-control': 'public, max-age=60' }).end()
  })

  const now = Date.now()
  let gets = 0
  const store = {
    // First get returns an expired entry, forcing the 304 revalidation replay path.
    get: () => Promise.resolve({
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'cache-control': 'public, max-age=60' },
      cacheControlDirectives: { public: true, 'max-age': 60 },
      cachedAt: now,
      staleAt: now + 60_000,
      deleteAt: ++gets === 1 ? now - 1 : now + 60_000,
      body: Readable.from([Buffer.alloc(32)])
    }),
    createWriteStream: () => new Writable({ write (_chunk, _enc, cb) { cb() } }),
    delete: () => {}
  }

  const client = new Client(origin)
    .compose(interceptors.cache({ store }), interceptors.dump({ maxSize: 8 }))
  after(() => client.close())

  await rejects(async () => {
    const res = await client.request({ path: '/', method: 'GET' })
    await res.body.text()
  }, { code: 'UND_ERR_ABORTED', message: /larger than maxSize/ })
})

test('304 revalidation replay failure releases the connection for reuse', async (t) => {
  // Converging the throw is not enough: the replay leaves the origin response
  // paused, so the failure path must release it or the next request on the
  // same connection hangs forever.
  const origin = await startServer(t, (req, res) => {
    if (req.url === '/ping') {
      res.writeHead(200).end('pong')
    } else {
      res.writeHead(304, { 'cache-control': 'public, max-age=60' }).end()
    }
  })

  const now = Date.now()
  let gets = 0
  const store = {
    // Only '/' has a (stale) cached entry, forcing the 304 revalidation replay.
    get: (key) => {
      if (key?.path !== '/') {
        return undefined
      }
      return Promise.resolve({
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'cache-control': 'public, max-age=60' },
        cacheControlDirectives: { public: true, 'max-age': 60 },
        cachedAt: now,
        staleAt: now + 60_000,
        deleteAt: ++gets === 1 ? now - 1 : now + 60_000,
        body: Readable.from([Buffer.alloc(32)])
      })
    },
    createWriteStream: () => new Writable({ write (_chunk, _enc, cb) { cb() } }),
    delete: () => {}
  }

  const client = new Client(origin)
    .compose(interceptors.cache({ store }), interceptors.dump({ maxSize: 8 }))
  after(() => client.close())

  await rejects(async () => {
    const res = await client.request({ path: '/', method: 'GET' })
    await res.body.text()
  }, { code: 'UND_ERR_ABORTED' })

  // The connection must be reusable promptly: without releasing the paused
  // origin response, the follow-up request stalls until a connection timeout
  // (several seconds) instead of completing immediately.
  const followUp = (async () => {
    const res = await client.request({ path: '/ping', method: 'GET' })
    await res.body.text()
    return res.statusCode
  })()
  const timer = new Promise((_resolve, reject) =>
    setTimeout(() => reject(new Error('follow-up request stalled: connection not released')), 2000).unref())
  strictEqual(await Promise.race([followUp, timer]), 200)
})
