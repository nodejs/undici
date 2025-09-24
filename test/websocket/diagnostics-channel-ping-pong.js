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
  const ws = new WebSocket(`ws://localhost:${port}`, 'chat')

  server.on('connection', (ws) => {
    ws.ping('Ping')
    ws.pong('Pong')
    ws.close()
  })

  const pingListener = ({ websocket, payload }) => {
    t.assert.strictEqual(websocket, ws)
    t.assert.deepStrictEqual(payload, Buffer.from('Ping'))
  }

  const pongListener = ({ websocket, payload }) => {
    t.assert.strictEqual(websocket, ws)
    t.assert.deepStrictEqual(payload, Buffer.from('Pong'))
  }

  dc.channel('undici:websocket:ping').subscribe(pingListener)
  dc.channel('undici:websocket:pong').subscribe(pongListener)

  t.after(() => {
    server.close()
    dc.channel('undici:websocket:ping').unsubscribe(pingListener)
    dc.channel('undici:websocket:pong').unsubscribe(pongListener)
  })

  await once(ws, 'close')
})
