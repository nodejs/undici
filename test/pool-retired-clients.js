'use strict'

// Clients a pool takes out of rotation (after a connection error, or when
// clientTtl expires) must not take more requests from the pool queue, and
// must still be reached by pool.close() and pool.destroy() until they have
// finished the requests they already had.
//
// These tests avoid wall-clock sleeps: they synchronize on server-side
// events (request received, socket closed) and mock `Date` to expire
// clientTtl deterministically.

const { test, after } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { setImmediate: flush } = require('node:timers/promises')
const { Pool, RoundRobinPool, Client, buildConnector } = require('..')

// Guards against hangs if a request is never settled.
const TEST_TIMEOUT = 10_000

// Requests to paths starting with `/hang` are held open until the test ends
// or calls `res.end()` itself.
async function startServer () {
  const sockets = new Set()
  const seen = []
  const requests = new Map()
  const waiters = new Map()
  let onAllClosed = null

  const server = createServer((req, res) => {
    seen.push(req.url)
    const entry = { req, res }
    requests.set(req.url, entry)
    waiters.get(req.url)?.(entry)
    waiters.delete(req.url)
    if (!req.url.startsWith('/hang')) {
      res.end('ok')
    }
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => {
      sockets.delete(socket)
      if (sockets.size === 0 && onAllClosed) {
        onAllClosed()
        onAllClosed = null
      }
    })
  })
  server.listen(0)
  await once(server, 'listening')
  after(() => {
    for (const socket of sockets) {
      socket.destroy()
    }
    server.close()
  })

  return {
    origin: `http://localhost:${server.address().port}`,
    seen,
    sockets,
    // Resolves with { req, res } once the server has received `url`.
    requested (url) {
      if (requests.has(url)) {
        return Promise.resolve(requests.get(url))
      }
      return new Promise((resolve) => waiters.set(url, resolve))
    },
    // Resolves once every server-side socket has closed.
    allSocketsClosed () {
      if (sockets.size === 0) {
        return Promise.resolve()
      }
      return new Promise((resolve) => { onAllClosed = resolve })
    }
  }
}

// The first connection attempt fails; later ones reach the server.
function failFirstConnect () {
  const connector = buildConnector({})
  let attempts = 0
  return (opts, cb) => {
    if (++attempts === 1) {
      const err = new Error('connect ECONNREFUSED (simulated)')
      err.code = 'ECONNREFUSED'
      process.nextTick(cb, err)
      return
    }
    return connector(opts, cb)
  }
}

function trackingFactory (clients) {
  return (origin, opts) => {
    const client = new Client(origin, opts)
    clients.push(client)
    return client
  }
}

function settle (promise) {
  return promise.then(
    async (res) => {
      await res.body.text()
      return res.statusCode
    },
    (err) => err.code
  )
}

// clientTtl is measured with Date.now(), so mocking only `Date` lets the
// test expire it instantly while real timers and I/O keep working.
// `now` must be non-zero: a client whose ttl stamp is 0 is never evicted.
const CLIENT_TTL = 1000
function mockDate (t) {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 })
  return () => t.mock.timers.tick(CLIENT_TTL + 1)
}

for (const [name, PoolType] of [['Pool', Pool], ['RoundRobinPool', RoundRobinPool]]) {
  test(`${name}: a client removed after a connection error does not take queued requests`, { timeout: TEST_TIMEOUT }, async (t) => {
    const { origin, seen } = await startServer()
    const clients = []
    const pool = new PoolType(origin, {
      connections: 1,
      connect: failFirstConnect(),
      factory: trackingFactory(clients)
    })
    after(() => pool.destroy())

    // The first request goes to the first client, which fails to connect.
    // The second waits in the pool queue.
    const first = settle(pool.request({ path: '/first', method: 'GET' }))
    const second = settle(pool.request({ path: '/second', method: 'GET' }))

    assert.strictEqual(await first, 'ECONNREFUSED')
    assert.strictEqual(await second, 200)
    assert.deepStrictEqual(seen, ['/second'])

    assert.strictEqual(clients.length, 2)
    assert.strictEqual(clients[0].closed, true, 'failed client is closed')
    assert.strictEqual(clients[1].closed, false, 'queued request went to a new client')
  })

  test(`${name}: destroy() aborts requests queued behind a connection error`, { timeout: TEST_TIMEOUT }, async (t) => {
    const server = await startServer()
    const pool = new PoolType(server.origin, {
      connections: 1,
      connect: failFirstConnect()
    })

    const first = settle(pool.request({ path: '/first', method: 'GET' }))
    const hang = settle(pool.request({ path: '/hang', method: 'GET' }))

    assert.strictEqual(await first, 'ECONNREFUSED')
    await server.requested('/hang')
    assert.strictEqual(pool.stats.connected, 1, 'pool accounts for the connection')

    await pool.destroy()
    assert.strictEqual(await hang, 'UND_ERR_DESTROYED')

    await server.allSocketsClosed()
  })

  test(`${name}: destroy() aborts in-flight requests on a client evicted by clientTtl`, { timeout: TEST_TIMEOUT }, async (t) => {
    const expireTtl = mockDate(t)
    const server = await startServer()
    const clients = []
    const pool = new PoolType(server.origin, {
      connections: 2,
      clientTtl: CLIENT_TTL,
      factory: trackingFactory(clients)
    })

    const hang = settle(pool.request({ path: '/hang', method: 'GET' }))
    await server.requested('/hang')

    // Once the TTL has passed, the next dispatch evicts the first client,
    // which keeps running /hang while it closes.
    expireTtl()
    assert.strictEqual(await settle(pool.request({ path: '/next', method: 'GET' })), 200)
    assert.strictEqual(clients[0].closed, true, 'first client was evicted')
    assert.strictEqual(clients[0].destroyed, false, 'evicted client is still running /hang')

    await pool.destroy()
    assert.strictEqual(await hang, 'UND_ERR_DESTROYED')

    await server.allSocketsClosed()
  })

  test(`${name}: close() waits for a client evicted by clientTtl`, { timeout: TEST_TIMEOUT }, async (t) => {
    const expireTtl = mockDate(t)
    const server = await startServer()
    const clients = []
    const pool = new PoolType(server.origin, {
      connections: 2,
      clientTtl: CLIENT_TTL,
      factory: trackingFactory(clients)
    })
    after(() => pool.destroy())

    const slow = settle(pool.request({ path: '/hang-slow', method: 'GET' }))
    const { res } = await server.requested('/hang-slow')

    expireTtl()
    assert.strictEqual(await settle(pool.request({ path: '/next', method: 'GET' })), 200)
    assert.strictEqual(clients[0].closed, true, 'first client was evicted')

    let closed = false
    const closing = pool.close().then(() => { closed = true })

    // Wait until every client still in rotation has fully closed. Close
    // callbacks run in order, so pool.close() has already seen them finish;
    // the extra turn lets pool.close() resolve if it (wrongly) ignored the
    // evicted client.
    await Promise.all(clients.slice(1).map((client) => client.close()))
    await flush()
    assert.strictEqual(closed, false, 'close() waits for the evicted client')

    res.end('slow')
    assert.strictEqual(await slow, 200)
    await closing
    assert.strictEqual(closed, true)
  })
}
