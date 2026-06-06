'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { WebSocket } = require('../..')

test('failed WebSocket handshake exposes a non-empty TypeError message', async (t) => {
  const server = createServer((req, res) => {
    res.statusCode = 200
    res.end('not a websocket')
  }).listen(0)

  await once(server, 'listening')
  t.after(() => server.close())

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)
  const errorPromise = once(ws, 'error')
  const closePromise = once(ws, 'close')

  ws.onopen = () => t.assert.fail('should not open')

  const [{ error }] = await errorPromise
  t.assert.ok(error instanceof TypeError)
  t.assert.strictEqual(error.message, 'Received network error or non-101 status code.')

  const [closeEvent] = await closePromise
  t.assert.strictEqual(closeEvent.code, 1006)
  t.assert.strictEqual(closeEvent.reason, '')
})
