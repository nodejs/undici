'use strict'

const { test } = require('node:test')
const dc = require('node:diagnostics_channel')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')
const { once } = require('node:events')

test('diagnostics channel - undici:websocket:[ping/pong]', async (t) => {
  t.plan(4)

  const server = new WebSocketServer({ port: 0 })
  const { port } = server.address()
  const pingChannel = dc.channel('undici:websocket:ping')
  const pongChannel = dc.channel('undici:websocket:pong')

  const pingListener = ({ websocket, payload }) => {
    // Diagnostics channels are process-global, so ignore events from other
    // WebSocket instances.
    if (websocket !== ws) {
      return
    }

    t.assert.strictEqual(websocket, ws)
    t.assert.deepStrictEqual(payload, Buffer.from('Ping'))
  }

  const pongListener = ({ websocket, payload }) => {
    // Diagnostics channels are process-global, so ignore events from other
    // WebSocket instances.
    if (websocket !== ws) {
      return
    }

    t.assert.strictEqual(websocket, ws)
    t.assert.deepStrictEqual(payload, Buffer.from('Pong'))
  }

  pingChannel.subscribe(pingListener)
  pongChannel.subscribe(pongListener)

  // The listeners and server handler must be in place before creating the
  // WebSocket, because the constructor starts the connection immediately.
  server.on('connection', (websocket) => {
    websocket.ping('Ping')
    websocket.pong('Pong')
    websocket.close()
  })

  const ws = new WebSocket(`ws://localhost:${port}`, 'chat')

  t.after(() => {
    server.close()
    pingChannel.unsubscribe(pingListener)
    pongChannel.unsubscribe(pongListener)
  })

  await once(ws, 'close')
})
