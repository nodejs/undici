'use strict'

// https://github.com/nodejs/undici/issues/386
//
// A request aborted before it reaches a connection must not wait for one:
// - a request whose signal is already aborted settles with the abort reason
//   without being dispatched, so no connection is opened and a refused
//   connection (ECONNREFUSED) cannot be reported in its place;
// - a request aborted while it waits for a connection (in the Pool queue, or
//   pending on a Client that is connecting or busy) fails right away instead
//   of when it reaches a socket.

const assert = require('node:assert')
const { once, EventEmitter, getEventListeners } = require('node:events')
const { createServer } = require('node:http')
const net = require('node:net')
const { Readable, Writable } = require('node:stream')
const { test } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')

const { Client, Pool, Agent, interceptors, cacheStores } = require('..')

async function listen (t) {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('asd')
  })
  t.after(() => server.close())

  server.listen(0)
  await once(server, 'listening')

  return server
}

test('an already aborted signal rejects the request without connecting', async (t) => {
  const server = await listen(t)

  const client = new Client(`http://localhost:${server.address().port}`)
  t.after(() => client.destroy())

  let connections = 0
  client.on('connect', () => connections++)

  t = tspl(t, { plan: 2 })

  const reason = new Error('aborted before dispatch')
  const ac = new AbortController()
  ac.abort(reason)

  const err = await client.request({ path: '/', method: 'GET', signal: ac.signal }).then(() => null, (err) => err)

  t.equal(err, reason)
  t.equal(connections, 0)

  await t.completed
})

test('an already aborted signal is reported instead of a connection error', async (t) => {
  const server = await listen(t)
  const { port } = server.address()

  // Nothing listens on the port anymore, so connecting would be refused.
  server.close()
  await once(server, 'close')

  const client = new Client(`http://localhost:${port}`)
  t.after(() => client.destroy())

  t = tspl(t, { plan: 1 })

  const reason = new Error('aborted before dispatch')
  const ac = new AbortController()
  ac.abort(reason)

  const err = await client.request({ path: '/', method: 'GET', signal: ac.signal }).then(() => null, (err) => err)

  t.equal(err, reason)

  await t.completed
})

test('an already aborted signal destroys a stream body', async (t) => {
  const server = await listen(t)

  const client = new Client(`http://localhost:${server.address().port}`)
  t.after(() => client.destroy())

  t = tspl(t, { plan: 2 })

  const body = new Readable({ read () {} })
  const ac = new AbortController()
  ac.abort()

  const err = await client.request({ path: '/', method: 'POST', body, signal: ac.signal }).then(() => null, (err) => err)

  t.equal(err?.name, 'AbortError')
  t.equal(body.destroyed, true)

  await t.completed
})

// Fails the test instead of hanging it when the promise does not settle.
function settlesWithin (promise, ms = 2000) {
  let timer
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`still pending after ${ms}ms`)), ms)
    })
  ]).finally(() => clearTimeout(timer))
}

// '/hold' responses wait until release() is called, everything else answers.
async function startServer (t) {
  const held = []
  let connections = 0
  const server = createServer((req, res) => {
    if (req.url === '/hold') {
      held.push(res)
    } else {
      res.end('ok')
    }
  })
  server.on('connection', () => { connections++ })
  server.listen(0)
  await once(server, 'listening')
  t.after(() => {
    for (const res of held) res.destroy()
    server.closeAllConnections?.()
    server.close()
  })
  return {
    origin: `http://localhost:${server.address().port}`,
    connections: () => connections,
    waitForHeld: async (n = 1) => {
      while (held.length < n) await new Promise(resolve => setImmediate(resolve))
    },
    release: () => {
      for (const res of held.splice(0)) res.end('released')
    }
  }
}

// A connector that never completes, e.g. a TLS handshake that hangs.
function hangingConnector () {
  const sockets = []
  const connect = (opts, callback) => {
    connect.calls++
    const socket = new net.Socket()
    sockets.push(socket)
  }
  connect.calls = 0
  connect.destroy = () => { for (const s of sockets) s.destroy() }
  return connect
}

test('a request aborted in the Pool queue rejects at once', async (t) => {
  const server = await startServer(t)
  const pool = new Pool(server.origin, { connections: 1 })
  t.after(() => pool.destroy())

  const first = pool.request({ path: '/hold', method: 'GET' })
  await server.waitForHeld()

  const ac = new AbortController()
  const second = pool.request({ path: '/', method: 'GET', signal: ac.signal })
  assert.strictEqual(pool.stats.queued, 1)

  ac.abort()
  await assert.rejects(settlesWithin(second), { name: 'AbortError' })
  assert.strictEqual(pool.stats.queued, 0)
  assert.strictEqual(getEventListeners(ac.signal, 'abort').length, 0)

  server.release()
  const res = await first
  assert.strictEqual(await res.body.text(), 'released')

  const third = await settlesWithin(pool.request({ path: '/', method: 'GET' }))
  assert.strictEqual(await third.body.text(), 'ok')
  assert.strictEqual(server.connections(), 1)
})

test('the Pool queue rejects with the abort reason and keeps other requests', async (t) => {
  const server = await startServer(t)
  const pool = new Pool(server.origin, { connections: 1 })
  t.after(() => pool.destroy())

  const first = pool.request({ path: '/hold', method: 'GET' })
  await server.waitForHeld()

  const ac = new AbortController()
  const reason = new Error('custom reason')
  const before = pool.request({ path: '/', method: 'GET' })
  const aborted = pool.request({ path: '/', method: 'GET', signal: ac.signal })
  const after = pool.request({ path: '/', method: 'GET' })
  assert.strictEqual(pool.stats.queued, 3)

  ac.abort(reason)
  await assert.rejects(settlesWithin(aborted), (err) => err === reason)
  assert.strictEqual(pool.stats.queued, 2)

  server.release()
  await (await first).body.dump()
  assert.strictEqual(await (await settlesWithin(before)).body.text(), 'ok')
  assert.strictEqual(await (await settlesWithin(after)).body.text(), 'ok')
})

test('a request aborted while the Client connects rejects at once', async (t) => {
  const connect = hangingConnector()
  const client = new Client('http://localhost:1', { connect })
  t.after(() => { connect.destroy(); return client.destroy() })

  const ac = new AbortController()
  const promise = client.request({ path: '/', method: 'GET', signal: ac.signal })
  assert.strictEqual(connect.calls, 1)
  assert.strictEqual(client.stats.pending, 1)

  ac.abort()
  await assert.rejects(settlesWithin(promise), { name: 'AbortError' })
  assert.strictEqual(client.stats.pending, 0)
  assert.strictEqual(getEventListeners(ac.signal, 'abort').length, 0)
})

test('a Pool reuses a connecting client after its only request is aborted', async (t) => {
  const server = await startServer(t)
  let release
  let calls = 0
  const connect = (opts, callback) => {
    calls++
    release = () => {
      const socket = net.connect(opts.port, opts.hostname)
      socket.once('connect', () => callback(null, socket))
    }
  }
  const pool = new Pool(server.origin, { connections: 1, connect })
  t.after(() => pool.destroy())

  const ac = new AbortController()
  const aborted = pool.request({ path: '/', method: 'GET', signal: ac.signal })
  ac.abort()
  await assert.rejects(settlesWithin(aborted), { name: 'AbortError' })

  // The connection attempt goes on and serves the next request.
  const next = pool.request({ path: '/', method: 'GET' })
  release()
  const res = await settlesWithin(next)
  assert.strictEqual(await res.body.text(), 'ok')
  assert.strictEqual(calls, 1)
})

test('a pending request behind a running one rejects at once', async (t) => {
  const server = await startServer(t)
  const client = new Client(server.origin)
  t.after(() => client.destroy())

  const first = client.request({ path: '/hold', method: 'GET' })
  await server.waitForHeld()

  const ac = new AbortController()
  const second = client.request({ path: '/', method: 'GET', signal: ac.signal })
  assert.strictEqual(client.stats.pending, 1)

  ac.abort()
  await assert.rejects(settlesWithin(second), { name: 'AbortError' })
  assert.strictEqual(client.stats.pending, 0)

  server.release()
  await (await first).body.dump()
  const res = await settlesWithin(client.request({ path: '/', method: 'GET' }))
  assert.strictEqual(await res.body.text(), 'ok')
  assert.strictEqual(server.connections(), 1)
})

test('an already aborted request does not open a connection', async (t) => {
  for (const Dispatcher of [Client, Pool, Agent]) {
    await t.test(Dispatcher.name, async (t) => {
      const connect = hangingConnector()
      const dispatcher = Dispatcher === Agent
        ? new Agent({ connect })
        : new Dispatcher('http://localhost:1', { connect })
      t.after(() => { connect.destroy(); return dispatcher.destroy() })

      const reason = new Error('aborted before dispatch')
      await assert.rejects(
        settlesWithin(dispatcher.request({ origin: 'http://localhost:1', path: '/', method: 'GET', signal: AbortSignal.abort(reason) })),
        (err) => err === reason
      )
      assert.strictEqual(connect.calls, 0)
    })
  }
})

test('every API rejects at once when aborted while connecting', async (t) => {
  const connect = hangingConnector()
  const client = new Client('http://localhost:1', { connect })
  t.after(() => { connect.destroy(); return client.destroy() })

  const calls = {
    request: (signal) => client.request({ path: '/', method: 'GET', signal }),
    stream: (signal) => client.stream({ path: '/', method: 'GET', signal }, () => new Writable()),
    connect: (signal) => client.connect({ path: '/', signal }),
    upgrade: (signal) => client.upgrade({ path: '/', signal }),
    pipeline: (signal) => new Promise((resolve, reject) => {
      const duplex = client.pipeline({ path: '/', method: 'GET', signal }, ({ body }) => body)
      duplex.on('error', reject).resume()
    })
  }

  for (const [name, call] of Object.entries(calls)) {
    const ac = new AbortController()
    const promise = call(ac.signal)
    ac.abort()
    await assert.rejects(settlesWithin(promise), { name: 'AbortError' }, name)
    assert.strictEqual(client.stats.pending, 0, name)
  }
})

test('an EventEmitter signal aborts a queued request', async (t) => {
  const connect = hangingConnector()
  const client = new Client('http://localhost:1', { connect })
  t.after(() => { connect.destroy(); return client.destroy() })

  const ee = new EventEmitter()
  const promise = client.request({ path: '/', method: 'GET', signal: ee })
  ee.emit('abort')
  await assert.rejects(settlesWithin(promise), { code: 'UND_ERR_ABORTED' })
  assert.strictEqual(ee.listenerCount('abort'), 0)
})

test('the retry interceptor does not retry a request aborted while queued', async (t) => {
  const connect = hangingConnector()
  let retries = 0
  const client = new Client('http://localhost:1', { connect }).compose(interceptors.retry({
    maxRetries: 5,
    minTimeout: 1,
    retry (_err, ctx, callback) {
      retries++
      callback(null)
    }
  }))
  t.after(() => { connect.destroy(); return client.destroy() })

  const ac = new AbortController()
  const promise = client.request({ path: '/', method: 'GET', signal: ac.signal })
  ac.abort()
  await assert.rejects(settlesWithin(promise), { name: 'AbortError' })
  assert.strictEqual(retries, 0)
  assert.strictEqual(connect.calls, 1)
})

test('a request with a stream body aborted while connecting rejects at once', async (t) => {
  const connect = hangingConnector()
  const client = new Client('http://localhost:1', { connect })
  t.after(() => { connect.destroy(); return client.destroy() })

  const ac = new AbortController()
  const body = new Readable({ read () {} })
  const promise = client.request({ path: '/', method: 'POST', body, signal: ac.signal })
  ac.abort()
  await assert.rejects(settlesWithin(promise), { name: 'AbortError' })
  assert.strictEqual(client.stats.pending, 0)
})

test('Pool close() resolves when the queued request is aborted', async (t) => {
  const server = await startServer(t)
  const pool = new Pool(server.origin, { connections: 1 })
  t.after(() => pool.destroy())

  const first = pool.request({ path: '/hold', method: 'GET' })
  await server.waitForHeld()

  const ac = new AbortController()
  const queued = pool.request({ path: '/', method: 'GET', signal: ac.signal })
  const closed = pool.close()

  ac.abort()
  await assert.rejects(settlesWithin(queued), { name: 'AbortError' })

  server.release()
  await (await first).body.dump()
  await settlesWithin(closed)
})

test('abort listeners are removed once a queued request is dispatched', async (t) => {
  const server = await startServer(t)
  const pool = new Pool(server.origin, { connections: 1 })
  t.after(() => pool.destroy())

  const first = pool.request({ path: '/hold', method: 'GET' })
  await server.waitForHeld()

  const ac = new AbortController()
  const second = pool.request({ path: '/', method: 'GET', signal: ac.signal })

  server.release()
  await (await first).body.dump()
  const res = await settlesWithin(second)
  assert.strictEqual(await res.body.text(), 'ok')
  // The request API drops its own listener a tick after the body ends.
  await new Promise(resolve => setImmediate(resolve))
  assert.strictEqual(getEventListeners(ac.signal, 'abort').length, 0)
})

test('an already aborted signal does not open a connection for any API', async (t) => {
  const connect = hangingConnector()
  const client = new Client('http://localhost:1', { connect })
  t.after(() => { connect.destroy(); return client.destroy() })

  const calls = {
    request: (signal) => client.request({ path: '/', method: 'GET', signal }),
    stream: (signal) => client.stream({ path: '/', method: 'GET', signal }, () => new Writable()),
    connect: (signal) => client.connect({ path: '/', signal }),
    upgrade: (signal) => client.upgrade({ path: '/', signal }),
    pipeline: (signal) => new Promise((resolve, reject) => {
      const duplex = client.pipeline({ path: '/', method: 'GET', signal }, ({ body }) => body)
      duplex.on('error', reject).resume()
    })
  }

  for (const [name, call] of Object.entries(calls)) {
    const reason = new Error(`${name} aborted before dispatch`)
    await assert.rejects(settlesWithin(call(AbortSignal.abort(reason))), (err) => err === reason, name)
  }
  assert.strictEqual(connect.calls, 0)
})

test('a queued request is aborted through every interceptor', async (t) => {
  const server = await startServer(t)
  const { dump, decompress, responseError, retry, redirect, cache, deduplicate, dns } = interceptors
  const cases = {
    dump: dump(),
    decompress: decompress(),
    responseError: responseError(),
    retry: retry(),
    redirect: redirect({ maxRedirections: 2 }),
    cache: cache(),
    deduplicate: deduplicate(),
    all: [
      dns({ dualStack: false, affinity: 4 }), retry(), redirect({ maxRedirections: 2 }), cache(),
      deduplicate(), decompress(), responseError(), dump()
    ]
  }

  for (const [name, interceptor] of Object.entries(cases)) {
    const pool = new Pool(server.origin, { connections: 1 })
    t.after(() => pool.destroy())

    const first = pool.request({ path: '/hold', method: 'GET' })
    await server.waitForHeld()

    const ac = new AbortController()
    const reason = new Error(`${name} aborted`)
    const queued = pool.compose(interceptor).request({ path: '/', method: 'GET', signal: ac.signal })
    ac.abort(reason)
    await assert.rejects(settlesWithin(queued), (err) => err === reason, name)
    assert.strictEqual(pool.stats.queued, 0, name)

    server.release()
    await (await first).body.dump()
  }
})

test('an abort during a stale-if-error revalidation does not serve the stale response', async (t) => {
  const server = createServer((req, res) => {
    res.setHeader('cache-control', 'max-age=1, stale-if-error=60')
    res.setHeader('etag', '"v1"')
    res.end('cached')
  })
  server.listen(0)
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })

  const connect = hangingConnector()
  const client = new Client(`http://localhost:${server.address().port}`)
  const store = new cacheStores.MemoryCacheStore()
  const cached = client.compose(interceptors.cache({ store }))
  t.after(() => client.destroy())

  const res = await cached.request({ path: '/', method: 'GET' })
  assert.strictEqual(await res.body.text(), 'cached')
  await client.close()
  await new Promise(resolve => setTimeout(resolve, 1100))

  // The entry is stale: revalidating it waits on a connection that never opens.
  const hanging = new Client(`http://localhost:${server.address().port}`, { connect })
  t.after(() => { connect.destroy(); return hanging.destroy() })
  const ac = new AbortController()
  const reason = new Error('aborted during revalidation')
  const promise = hanging.compose(interceptors.cache({ store })).request({ path: '/', method: 'GET', signal: ac.signal })
  await new Promise(resolve => setImmediate(resolve))
  assert.strictEqual(connect.calls, 1)
  ac.abort(reason)
  await assert.rejects(settlesWithin(promise), (err) => err === reason)
})

test('the caller\'s abort does not cancel a background revalidation', async (t) => {
  let requests = 0
  const server = createServer((req, res) => {
    requests++
    res.setHeader('cache-control', 'max-age=1, stale-while-revalidate=60')
    res.end('cached')
  })
  server.listen(0)
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })

  // An async store: the caller can abort while its cache lookup is pending.
  const inner = new cacheStores.MemoryCacheStore()
  const store = {
    get: (key) => new Promise(resolve => setTimeout(() => resolve(inner.get(key)), 20)),
    createWriteStream: (key, value) => inner.createWriteStream(key, value),
    delete: (key) => inner.delete(key)
  }
  const connect = hangingConnector()
  const client = new Client(`http://localhost:${server.address().port}`)
  t.after(() => client.destroy())
  await (await client.compose(interceptors.cache({ store })).request({ path: '/', method: 'GET' })).body.dump()
  await client.close()
  await new Promise(resolve => setTimeout(resolve, 1100))

  // The stale entry is served and revalidated in the background, on a
  // connection that never opens.
  const hanging = new Client(`http://localhost:${server.address().port}`, { connect })
  t.after(() => { connect.destroy(); return hanging.destroy() })
  const ac = new AbortController()
  const promise = hanging.compose(interceptors.cache({ store })).request({ path: '/', method: 'GET', signal: ac.signal })
  ac.abort()
  await assert.rejects(settlesWithin(promise), { name: 'AbortError' })

  // Wait for the store lookup and the background revalidation to be queued.
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.strictEqual(connect.calls, 1)
  assert.strictEqual(hanging.stats.pending, 1)
  assert.strictEqual(requests, 1)
})
