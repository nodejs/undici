'use strict'

const { test } = require('node:test')
const dc = require('node:diagnostics_channel')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')
const { tspl } = require('@matteo.collina/tspl')

test('diagnostics channel - undici:websocket:[ping/pong]', async (t) => {
  const { deepStrictEqual, equal, completed } = tspl(t, { plan: 4 })

  const server = new WebSocketServer({ port: 0 })
  const { port } = server.address()
  const ws = new WebSocket(`ws://localhost:${port}`, 'chat')

  server.on('connection', (ws) => {
    ws.ping('Ping')
    ws.pong('Pong')
  })

  const pingListener = ({ websocket, payload }) => {
    equal(websocket, ws)
    deepStrictEqual(payload, Buffer.from('Ping'))
  }

  const pongListener = ({ websocket, payload }) => {
    equal(websocket, ws)
    deepStrictEqual(payload, Buffer.from('Pong'))
  }

  dc.channel('undici:websocket:ping').subscribe(pingListener)
  dc.channel('undici:websocket:pong').subscribe(pongListener)

  t.after(() => {
    server.close()
    ws.close()
    dc.channel('undici:websocket:ping').unsubscribe(pingListener)
    dc.channel('undici:websocket:pong').unsubscribe(pongListener)
  })

  await completed
})
