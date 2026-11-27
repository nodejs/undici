'use strict'

// A connection attempt whose requests were all aborted must not keep its
// connection slot until it connects or times out: the Client destroys it, and
// the next request opens a new connection. An attempt that a request still
// waits for is kept.

const { test } = require('node:test')
const assert = require('node:assert')
const { once } = require('node:events')
const net = require('node:net')
const https = require('node:https')
const http2 = require('node:http2')
const diagnosticsChannel = require('node:diagnostics_channel')
const pem = require('@metcoder95/https-pem')
const { Client, Pool, buildConnector } = require('..')

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

// A TLS server behind a TCP front. The front holds the first connection: it
// never forwards it, so its TLS handshake hangs, or forwards it after
// `delayFirst` ms. Later connections are forwarded at once.
async function startServer (t, { h2 = false, delayFirst = null } = {}) {
  const handler = (req, res) => res.end('ok')
  const server = h2
    ? http2.createSecureServer({ ...pem, allowHTTP1: true }, handler)
    : https.createServer(pem, handler)
  server.listen(0)
  await once(server, 'listening')

  const sockets = []
  let accepted = 0
  let first = null
  let onFirst
  const firstAccepted = new Promise(resolve => { onFirst = resolve })
  const front = net.createServer((socket) => {
    accepted++
    sockets.push(socket)
    const forward = () => {
      const upstream = net.connect(server.address().port)
      sockets.push(upstream)
      socket.pipe(upstream).pipe(socket)
      socket.on('error', () => upstream.destroy())
      upstream.on('error', () => socket.destroy())
    }

    if (first !== null) {
      forward()
      return
    }

    first = socket
    onFirst(socket)
    if (delayFirst !== null) {
      setTimeout(forward, delayFirst)
    } else {
      // Read and drop the handshake, so the client closing it is seen.
      socket.resume()
    }
  })
  front.listen(0)
  await once(front, 'listening')

  t.after(() => {
    for (const socket of sockets) socket.destroy()
    front.close()
    server.close()
  })

  return {
    origin: `https://localhost:${front.address().port}`,
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

for (const h2 of [false, true]) {
  for (const connectTimeout of [undefined, 0]) {
    test(`${h2 ? 'h2' : 'h1'}, connectTimeout ${connectTimeout}: a connection attempt whose only request was aborted is destroyed`, async (t) => {
      const server = await startServer(t, { h2 })
      const pool = new Pool(server.origin, {
        connections: 1,
        connectTimeout,
        allowH2: h2,
        connect: { rejectUnauthorized: false }
      })
      t.after(() => pool.destroy())

      const connectionErrors = []
      pool.on('connectionError', (origin, targets, err) => connectionErrors.push(err))

      const ac = new AbortController()
      const first = pool.request({ path: '/', method: 'GET', signal: ac.signal })
      await new Promise(resolve => setTimeout(resolve, 50))
      ac.abort()
      await assert.rejects(settlesWithin(first), { name: 'AbortError' })

      // The hanging handshake is closed instead of holding the only slot.
      await settlesWithin(server.firstClosed())

      const { statusCode, body } = await settlesWithin(pool.request({ path: '/', method: 'GET' }))
      assert.strictEqual(statusCode, 200)
      assert.strictEqual(await body.text(), 'ok')
      assert.strictEqual(server.accepted(), 2)

      // Cancelling is not a connection error: the Pool keeps its client.
      assert.deepStrictEqual(connectionErrors, [])
    })
  }
}

test('a cancelled connection attempt is published as a connect error', async (t) => {
  const server = await startServer(t)
  const client = new Client(server.origin, { connect: { rejectUnauthorized: false } })
  t.after(() => client.destroy())

  const errors = []
  const onConnectError = ({ error }) => errors.push(error)
  diagnosticsChannel.subscribe('undici:client:connectError', onConnectError)
  t.after(() => diagnosticsChannel.unsubscribe('undici:client:connectError', onConnectError))

  const ac = new AbortController()
  const request = client.request({ path: '/', method: 'GET', signal: ac.signal })
  await new Promise(resolve => setTimeout(resolve, 50))
  ac.abort()
  await assert.rejects(settlesWithin(request), { name: 'AbortError' })
  await settlesWithin(server.firstClosed())

  assert.strictEqual(errors.length, 1)
  assert.strictEqual(errors[0].code, 'UND_ERR_INFO')
})

test('a connection attempt that a request queued in the Pool waits for is kept', async (t) => {
  const server = await startServer(t, { delayFirst: 300 })
  const pool = new Pool(server.origin, { connections: 1, connect: { rejectUnauthorized: false } })
  t.after(() => pool.destroy())

  const ac = new AbortController()
  const first = pool.request({ path: '/', method: 'GET', signal: ac.signal })
  // Waits in the Pool queue: the only client is busy with the first request.
  const second = pool.request({ path: '/', method: 'GET' })
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.strictEqual(pool.stats.queued, 1)

  ac.abort()
  await assert.rejects(settlesWithin(first), { name: 'AbortError' })

  const { statusCode, body } = await settlesWithin(second)
  assert.strictEqual(statusCode, 200)
  await body.dump()
  assert.strictEqual(server.accepted(), 1)
})

test('a connection attempt that another pipelined request waits for is kept', async (t) => {
  const server = await startServer(t, { delayFirst: 300 })
  const client = new Client(server.origin, { pipelining: 2, connect: { rejectUnauthorized: false } })
  t.after(() => client.destroy())

  const ac = new AbortController()
  const first = client.request({ path: '/', method: 'GET', signal: ac.signal })
  const second = client.request({ path: '/', method: 'GET' })
  await new Promise(resolve => setTimeout(resolve, 50))

  ac.abort()
  await assert.rejects(settlesWithin(first), { name: 'AbortError' })

  const { statusCode, body } = await settlesWithin(second)
  assert.strictEqual(statusCode, 200)
  await body.dump()
  assert.strictEqual(server.accepted(), 1)
})

test('a request dispatched right after the abort uses the connection attempt', async (t) => {
  const server = await startServer(t, { delayFirst: 300 })
  const client = new Client(server.origin, { connect: { rejectUnauthorized: false } })
  t.after(() => client.destroy())

  const ac = new AbortController()
  const first = client.request({ path: '/', method: 'GET', signal: ac.signal })
  await new Promise(resolve => setTimeout(resolve, 50))

  ac.abort()
  const second = client.request({ path: '/', method: 'GET' })
  await assert.rejects(settlesWithin(first), { name: 'AbortError' })

  const { statusCode, body } = await settlesWithin(second)
  assert.strictEqual(statusCode, 200)
  await body.dump()
  assert.strictEqual(server.accepted(), 1)
})

test('a connection attempt from a custom connector that returns its socket is destroyed', async (t) => {
  const server = await startServer(t)
  const connector = buildConnector({ rejectUnauthorized: false })
  const client = new Client(server.origin, {
    connect (opts, callback) {
      return connector(opts, callback)
    }
  })
  t.after(() => client.destroy())

  const ac = new AbortController()
  const request = client.request({ path: '/', method: 'GET', signal: ac.signal })
  await new Promise(resolve => setTimeout(resolve, 50))
  ac.abort()
  await assert.rejects(settlesWithin(request), { name: 'AbortError' })
  await settlesWithin(server.firstClosed())
})

test('a connection attempt from a connector that does not return its socket is kept', async (t) => {
  const server = await startServer(t, { delayFirst: 300 })
  const connector = buildConnector({ rejectUnauthorized: false })
  const client = new Client(server.origin, {
    connect (opts, callback) {
      connector(opts, callback)
    }
  })
  t.after(() => client.destroy())

  const ac = new AbortController()
  const first = client.request({ path: '/', method: 'GET', signal: ac.signal })
  await new Promise(resolve => setTimeout(resolve, 50))
  ac.abort()
  await assert.rejects(settlesWithin(first), { name: 'AbortError' })

  // Not cancelled: the next request is served once the attempt connects.
  await new Promise(resolve => setTimeout(resolve, 50))
  const { statusCode, body } = await settlesWithin(client.request({ path: '/', method: 'GET' }))
  assert.strictEqual(statusCode, 200)
  await body.dump()
  assert.strictEqual(server.accepted(), 1)
})
