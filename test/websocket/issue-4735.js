'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const net = require('node:net')

const { WebSocket } = require('../..')

// Regression test for https://github.com/nodejs/undici/issues/4735
// Prior to 7.16.0 WebSocket's ErrorEvent.error had a descriptive message
// ("Received network error or non-101 status code.") when the connection
// could not be opened. After #4521 the message became an empty string,
// leaving consumers without any information about why the connection failed.

test('error event on failed connection has a non-empty message', async (t) => {
  t.plan(4)

  // Reserve a port and immediately release it so a connection attempt will be
  // refused (ECONNREFUSED) — no server ever accepts on this port.
  const probe = net.createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const { port } = probe.address()
  await new Promise((resolve) => probe.close(resolve))

  const ws = new WebSocket(`ws://127.0.0.1:${port}/`)

  ws.addEventListener('error', (ev) => {
    t.assert.ok(ev.error instanceof TypeError, 'error should be a TypeError')
    t.assert.ok(
      typeof ev.error.message === 'string' && ev.error.message.length > 0,
      `error.message should be non-empty, got ${JSON.stringify(ev.error.message)}`
    )
    t.assert.strictEqual(
      ev.error.message,
      'Received network error or non-101 status code.'
    )
  })

  const [closeEvent] = await once(ws, 'close')
  t.assert.strictEqual(closeEvent.code, 1006)
})
