'use strict'

const { test } = require('node:test')
const { getEventListeners } = require('node:events')
const { WebSocketServer } = require('ws')
const { WebSocketStream } = require('../../..')

// A WebSocketStream created with a signal must remove its abort listener once
// the opening handshake concludes, otherwise a long-lived signal keeps the
// closed WebSocketStream (and its listener) alive. See the abort steps in
// https://websockets.spec.whatwg.org/#dom-websocketstream-websocketstream
test('WebSocketStream removes its abort listener after a clean close', async (t) => {
  const server = new WebSocketServer({ port: 0 })
  t.after(() => server.close())

  const controller = new AbortController()
  const wss = new WebSocketStream(`ws://localhost:${server.address().port}`, {
    signal: controller.signal
  })

  const { writable } = await wss.opened

  // Listener must already be gone once the handshake has succeeded.
  t.assert.strictEqual(getEventListeners(controller.signal, 'abort').length, 0)

  const writer = writable.getWriter()
  await writer.close()
  await Promise.allSettled([wss.closed])

  t.assert.strictEqual(getEventListeners(controller.signal, 'abort').length, 0)
})

test('WebSocketStream removes its abort listener after an aborted handshake', async (t) => {
  const sockets = new Set()
  const server = new WebSocketServer({ port: 0 })
  server.on('connection', (ws) => {
    sockets.add(ws)
    ws.on('close', () => sockets.delete(ws))
  })

  t.after(() => {
    for (const ws of sockets) ws.terminate()
    server.close()
  })

  const controller = new AbortController()
  const wss = new WebSocketStream(`ws://localhost:${server.address().port}`, {
    signal: controller.signal
  })

  controller.abort(new Error('abort before open'))

  await Promise.allSettled([wss.opened, wss.closed])

  t.assert.strictEqual(getEventListeners(controller.signal, 'abort').length, 0)
})
