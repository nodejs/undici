'use strict'

// A stream timeout only resets that stream, so a connection that silently
// stopped delivering data (dropped by a NAT or load balancer, a hung peer)
// used to keep receiving new streams that all timed out in turn. The client
// must drop a connection on which nothing at all arrived while a stream timed
// out, like HTTP/1.1 drops the socket, and leave a live one alone.

const { test, after } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http2')
const net = require('node:net')
const { once } = require('node:events')

const { Pool } = require('..')

// A TCP proxy in front of an h2c server. Calling `goDark()` stops forwarding
// in both directions on the current connections without closing them.
async function startProxiedServer (onStream) {
  const server = createServer()
  server.on('stream', onStream)
  await once(server.listen(0), 'listening')

  const state = { connections: 0, goDark: null }
  const sockets = new Set()

  const proxy = net.createServer((downstream) => {
    state.connections++
    const upstream = net.connect(server.address().port)
    let dark = false
    state.goDark = () => { dark = true }
    sockets.add(downstream).add(upstream)
    downstream.on('data', (chunk) => { if (!dark) upstream.write(chunk) })
    upstream.on('data', (chunk) => { if (!dark) downstream.write(chunk) })
    downstream.on('error', () => {})
    upstream.on('error', () => {})
    downstream.on('close', () => upstream.destroy())
    upstream.on('close', () => downstream.destroy())
  })
  await once(proxy.listen(0), 'listening')

  after(() => {
    for (const socket of sockets) socket.destroy()
    proxy.close()
    server.close()
  })

  return { state, origin: `http://localhost:${proxy.address().port}` }
}

test('h2: a connection that went silent is replaced after a stream times out', async () => {
  const { state, origin } = await startProxiedServer((stream) => {
    stream.on('error', () => {})
    stream.respond({ ':status': 200 })
    stream.end('ok')
  })

  const pool = new Pool(origin, { useH2c: true, headersTimeout: 100 })
  after(() => pool.destroy())

  const first = await pool.request({ path: '/', method: 'GET' })
  assert.strictEqual(await first.body.text(), 'ok')

  state.goDark()

  await assert.rejects(
    pool.request({ path: '/', method: 'GET' }),
    { code: 'UND_ERR_HEADERS_TIMEOUT' }
  )

  const third = await pool.request({ path: '/', method: 'GET' })
  assert.strictEqual(await third.body.text(), 'ok')
  assert.strictEqual(state.connections, 2)
})

test('h2: a stream timeout on a live connection keeps the connection', async () => {
  let release
  const slowArrived = new Promise((resolve) => { release = resolve })

  const { state, origin } = await startProxiedServer((stream, headers) => {
    stream.on('error', () => {})
    if (headers[':path'] === '/slow') {
      // Never answered.
      release()
      return
    }
    stream.respond({ ':status': 200 })
    stream.end('ok')
  })

  const pool = new Pool(origin, { useH2c: true })
  after(() => pool.destroy())

  const warmup = await pool.request({ path: '/', method: 'GET' })
  await warmup.body.text()

  const slow = pool.request({ path: '/slow', method: 'GET', headersTimeout: 500 })
  await slowArrived

  // Data arrives on the connection while /slow waits.
  const fast = await pool.request({ path: '/', method: 'GET' })
  assert.strictEqual(await fast.body.text(), 'ok')

  await assert.rejects(slow, { code: 'UND_ERR_HEADERS_TIMEOUT' })

  const next = await pool.request({ path: '/', method: 'GET' })
  assert.strictEqual(await next.body.text(), 'ok')
  assert.strictEqual(state.connections, 1)
})
