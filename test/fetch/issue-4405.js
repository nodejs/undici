'use strict'

// https://github.com/nodejs/undici/issues/4405
// A fetch aborted while it waits for a connection must leave the dispatcher
// queue, so that a connection attempt that no request waits for any more is
// destroyed instead of keeping the process alive until it times out. The same
// goes for a WebSocket or an EventSource closed while they connect.

const { test } = require('node:test')
const assert = require('node:assert')
const { once } = require('node:events')
const net = require('node:net')
const http = require('node:http')
const https = require('node:https')
const pem = require('@metcoder95/https-pem')
const { fetch, Pool, Agent, Dispatcher, WebSocket, EventSource, interceptors, buildConnector } = require('../..')
const { kQueuedAbort } = require('../../lib/core/symbols')

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

// '/hold' responses wait until release() is called, routes answer as given,
// everything else answers 'ok'.
async function startServer (t, routes = {}) {
  const held = []
  const hits = {}
  const server = http.createServer((req, res) => {
    hits[req.url] = (hits[req.url] ?? 0) + 1
    if (req.url === '/hold') {
      held.push(res)
    } else if (routes[req.url]) {
      routes[req.url](req, res)
    } else {
      res.end('ok')
    }
  })
  server.listen(0)
  await once(server, 'listening')
  t.after(() => {
    for (const res of held) res.destroy()
    server.closeAllConnections()
    server.close()
  })
  return {
    origin: `http://localhost:${server.address().port}`,
    hits: (path) => hits[path] ?? 0,
    waitForHeld: async () => {
      while (held.length === 0) await new Promise(resolve => setImmediate(resolve))
    },
    release: () => {
      for (const res of held.splice(0)) res.end('released')
    }
  }
}

// A TLS server behind a TCP front that never forwards the first connection,
// so its TLS handshake hangs. Later connections are forwarded.
async function startHangingFirstConnection (t) {
  const server = https.createServer(pem, (req, res) => res.end('ok'))
  server.listen(0)
  await once(server, 'listening')

  const sockets = []
  let accepted = 0
  let onFirst
  const firstAccepted = new Promise(resolve => { onFirst = resolve })
  const front = net.createServer((socket) => {
    sockets.push(socket)
    if (accepted++ === 0) {
      onFirst(socket)
      // Read and drop the handshake, so the client closing it is seen.
      socket.resume()
      return
    }
    const upstream = net.connect(server.address().port)
    sockets.push(upstream)
    socket.pipe(upstream).pipe(socket)
    socket.on('error', () => upstream.destroy())
    upstream.on('error', () => socket.destroy())
  })
  front.listen(0)
  await once(front, 'listening')
  t.after(() => {
    for (const socket of sockets) socket.destroy()
    front.close()
    server.close()
  })

  return {
    port: front.address().port,
    accepted: () => accepted,
    // Resolves once the client closed the first connection.
    firstClosed: async () => {
      const socket = await firstAccepted
      if (!socket.destroyed) {
        await once(socket, 'close')
      }
    }
  }
}

test('only a fetch that can be aborted passes the queued-abort hook', async (t) => {
  // Records the options of each dispatch, then fails it.
  class Recorder extends Dispatcher {
    seen = []
    dispatch (opts, handler) {
      this.seen.push(opts[kQueuedAbort])
      handler.onResponseError(null, new Error('recorded'))
      return true
    }
  }
  const dispatcher = new Recorder()

  await assert.rejects(fetch('http://localhost/', { dispatcher }))
  await assert.rejects(fetch('http://localhost/', { dispatcher, signal: new AbortController().signal }))

  assert.strictEqual(dispatcher.seen[0], undefined)
  assert.strictEqual(typeof dispatcher.seen[1], 'function')
})

test('a fetch aborted while it waits in the Pool queue leaves the queue', async (t) => {
  const server = await startServer(t)
  const pool = new Pool(server.origin, { connections: 1 })
  t.after(() => pool.destroy())

  const hold = fetch(`${server.origin}/hold`, { dispatcher: pool })
  await server.waitForHeld()

  const ac = new AbortController()
  const queued = fetch(`${server.origin}/`, { dispatcher: pool, signal: ac.signal })
  while (pool.stats.queued === 0) await new Promise(resolve => setImmediate(resolve))

  ac.abort()
  await assert.rejects(settlesWithin(queued), { name: 'AbortError' })
  assert.strictEqual(pool.stats.queued, 0)

  server.release()
  await (await hold).text()
  assert.strictEqual(server.hits('/'), 0)
})

test('a fetch aborted while its TLS handshake hangs destroys the connection attempt', async (t) => {
  const server = await startHangingFirstConnection(t)
  const origin = `https://localhost:${server.port}`
  const agent = new Agent({ connections: 1, connect: { rejectUnauthorized: false } })
  t.after(() => agent.destroy())

  const ac = new AbortController()
  const first = fetch(origin, { dispatcher: agent, signal: ac.signal })
  await new Promise(resolve => setTimeout(resolve, 50))
  ac.abort()
  await assert.rejects(settlesWithin(first), { name: 'AbortError' })
  await settlesWithin(server.firstClosed())

  // The connection slot is free: the next fetch opens a new connection at once.
  const res = await settlesWithin(fetch(origin, { dispatcher: agent }))
  assert.strictEqual(await res.text(), 'ok')
  assert.strictEqual(server.accepted(), 2)
})

test('a fetch aborted while the retry of a started attempt waits for a connection does not send the retry', async (t) => {
  const server = await startServer(t, {
    '/flaky': (req, res) => {
      res.statusCode = 500
      res.end('fail')
    }
  })
  const pool = new Pool(server.origin, { connections: 1 })
  t.after(() => pool.destroy())
  const dispatcher = pool.compose(interceptors.retry({ minTimeout: 50, maxRetries: 3 }))

  const ac = new AbortController()
  const reason = new Error('aborted while its retry waits')
  const retried = fetch(`${server.origin}/flaky`, { dispatcher, signal: ac.signal })
  retried.catch(() => {})

  // The first attempt fails; hold the only connection so the retry queues.
  while (server.hits('/flaky') === 0) await new Promise(resolve => setImmediate(resolve))
  const hold = pool.request({ path: '/hold', method: 'GET' })
  await server.waitForHeld()
  while (pool.stats.queued === 0) await new Promise(resolve => setImmediate(resolve))

  ac.abort(reason)
  await assert.rejects(settlesWithin(retried), reason)
  assert.strictEqual(pool.stats.queued, 0)

  server.release()
  await (await hold).body.dump()
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.strictEqual(server.hits('/flaky'), 1)
})

test('a fetch aborted while it waits for a retry of an attempt that never started does not send the retry', async (t) => {
  const server = await startServer(t)
  // The first connection fails, so the first attempt never starts.
  const connector = buildConnector({})
  let connects = 0
  let onFailed
  const failed = new Promise(resolve => { onFailed = resolve })
  const pool = new Pool(server.origin, {
    connections: 1,
    connect (opts, callback) {
      if (connects++ === 0) {
        callback(Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }), null)
        onFailed()
        return
      }
      return connector(opts, callback)
    }
  })
  t.after(() => pool.destroy())
  const dispatcher = pool.compose(interceptors.retry({ minTimeout: 100, maxRetries: 3 }))

  const ac = new AbortController()
  const retried = fetch(`${server.origin}/retried`, { dispatcher, signal: ac.signal })
  retried.catch(() => {})

  // Hold the only connection so the retry queues.
  await failed
  const hold = pool.request({ path: '/hold', method: 'GET' })
  await server.waitForHeld()
  while (pool.stats.queued === 0) await new Promise(resolve => setImmediate(resolve))

  ac.abort()
  await assert.rejects(settlesWithin(retried), { name: 'AbortError' })
  assert.strictEqual(pool.stats.queued, 0)

  server.release()
  await (await hold).body.dump()
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.strictEqual(server.hits('/retried'), 0)
})

test('a WebSocket closed while its TLS handshake hangs destroys the connection attempt', async (t) => {
  const server = await startHangingFirstConnection(t)
  const agent = new Agent({ connect: { rejectUnauthorized: false } })
  t.after(() => agent.destroy())

  const ws = new WebSocket(`wss://localhost:${server.port}/`, { dispatcher: agent })
  ws.onerror = () => {}
  await new Promise(resolve => setTimeout(resolve, 50))
  const closed = once(ws, 'close')
  ws.close()

  const [event] = await settlesWithin(closed)
  assert.strictEqual(event.code, 1006)
  await settlesWithin(server.firstClosed())
})

test('an EventSource closed while its TLS handshake hangs destroys the connection attempt', async (t) => {
  const server = await startHangingFirstConnection(t)
  const agent = new Agent({ connect: { rejectUnauthorized: false } })
  t.after(() => agent.destroy())

  const es = new EventSource(`https://localhost:${server.port}/`, { dispatcher: agent })
  let errors = 0
  es.onerror = () => { errors++ }
  await new Promise(resolve => setTimeout(resolve, 50))
  es.close()

  await settlesWithin(server.firstClosed())
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.strictEqual(errors, 0)
})
