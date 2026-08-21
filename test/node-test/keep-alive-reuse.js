'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { Pool } = require('../..')

// Regression for #5600 / #5606:
// Reusing an idle keep-alive socket must not stall behind the poll phase.
// Progress is asserted via logical I/O events (server 'connection' / 'request'),
// not wall-clock thresholds. If idle-socket validation is deferred with an
// unref'd setImmediate, the poll phase blocks on the re-ref'd socket and this
// test hits the timeout instead of completing.
//
// The buggy setImmediate path stalls ~TICK_MS (~499ms) per reuse when the
// event loop is idle (woken only by undici's fast-timer tick). Five reuses
// therefore take well over 1s when regressed, and a few dozen ms when fixed.

const REUSES = 5

test('reusing an idle keep-alive socket must not stall', { timeout: 1000 }, async (t) => {
  let connections = 0

  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-length': 2 })
    res.end('ok')
  })

  server.on('connection', () => {
    connections++
  })

  server.listen(0)
  await once(server, 'listening')

  const pool = new Pool(`http://127.0.0.1:${server.address().port}`, {
    connections: 1
  })

  t.after(async () => {
    await pool.close()
    server.close()
  })

  // Establish the keep-alive connection.
  {
    const res = await pool.request({ path: '/0', method: 'GET' })
    assert.strictEqual(await res.body.text(), 'ok')
  }
  assert.strictEqual(connections, 1)

  // Each reuse is gated on the server observing the request. Between
  // iterations the client socket is idle/unref'd, which is the state that
  // triggers idle-socket validation on the next dispatch.
  for (let i = 1; i <= REUSES; i++) {
    const requested = once(server, 'request')
    const resPromise = pool.request({ path: `/${i}`, method: 'GET' })
    // Suppress unhandled rejection if the test times out mid-request.
    resPromise.catch(() => {})

    await requested

    const res = await resPromise
    assert.strictEqual(await res.body.text(), 'ok')
    assert.strictEqual(connections, 1, 'keep-alive socket must be reused')
  }
})
