'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { createServer } = require('node:http')
const dc = require('node:diagnostics_channel')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

test('diagnostics channel - undici:websocket:[created/handshakeRequest]', async (t) => {
  t.plan(10)

  const server = createServer()
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.close(1000, 'done')
    })
  })

  server.listen(0)
  await once(server, 'listening')

  const url = `ws://localhost:${server.address().port}`
  const events = []
  let createdWebSocket
  let handshakeWebSocket

  const createdListener = ({ websocket, url: createdUrl }) => {
    events.push('created')
    createdWebSocket = websocket
    t.assert.strictEqual(createdUrl, `${url}/`)
  }

  const handshakeRequestListener = ({ websocket, request }) => {
    events.push('handshakeRequest')
    handshakeWebSocket = websocket
    t.assert.strictEqual(typeof request, 'object')
    t.assert.strictEqual(typeof request.headers, 'object')
    t.assert.strictEqual(request.headers['sec-websocket-version'], '13')
    t.assert.strictEqual(request.headers['sec-websocket-extensions'], 'permessage-deflate; client_max_window_bits')
    t.assert.strictEqual(typeof request.headers['sec-websocket-key'], 'string')
  }

  dc.channel('undici:websocket:created').subscribe(createdListener)
  dc.channel('undici:websocket:handshakeRequest').subscribe(handshakeRequestListener)

  const ws = new WebSocket(url)

  t.after(() => {
    dc.channel('undici:websocket:created').unsubscribe(createdListener)
    dc.channel('undici:websocket:handshakeRequest').unsubscribe(handshakeRequestListener)
    wss.close()
    server.close()
  })

  await once(ws, 'close')

  t.assert.deepStrictEqual(events, ['created', 'handshakeRequest'])
  t.assert.strictEqual(createdWebSocket, ws)
  t.assert.strictEqual(handshakeWebSocket, ws)
  t.assert.strictEqual(ws.url, `${url}/`)
})
