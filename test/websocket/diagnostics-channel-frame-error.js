'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const dc = require('node:diagnostics_channel')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')
const { WebsocketFrameSend } = require('../../lib/web/websocket/frame')

test('diagnostics channel - undici:websocket:frameError', async (t) => {
  t.plan(3)

  const body = Buffer.allocUnsafe(2)
  body.writeUInt16BE(1006, 0)

  const frame = new WebsocketFrameSend(body)
  const buffer = frame.createFrame(0x8)

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (socket) => {
    socket._socket.write(buffer, () => socket.close())
  })

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  const frameErrorListener = ({ websocket, error }) => {
    t.assert.strictEqual(websocket, ws)
    t.assert.strictEqual(error.message, 'Frame cannot be masked')
  }

  dc.channel('undici:websocket:frameError').subscribe(frameErrorListener)

  t.after(() => {
    server.close()
    ws.close()
    dc.channel('undici:websocket:frameError').unsubscribe(frameErrorListener)
  })

  await once(ws, 'close')
  t.assert.strictEqual(ws.readyState, WebSocket.CLOSED)
})
