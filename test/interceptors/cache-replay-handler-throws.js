'use strict'

const { createServer } = require('node:http')
const { test, after } = require('node:test')
const { once } = require('node:events')
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
