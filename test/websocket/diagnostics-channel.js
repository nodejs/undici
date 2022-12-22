'use strict'

const { test } = require('tap')
const dc = require('diagnostics_channel')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

test('undici:websocket:open and undici:websocket:close', (t) => {
  t.plan(6)

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    ws.close(1000, 'goodbye')
  })

  t.teardown(server.close.bind(server))

  const { port } = server.address()

  dc.channel('undici:websocket:open').subscribe(({ extensions, protocol }) => {
    t.equal(extensions, null)
    t.equal(protocol, 'chat')
  })

  dc.channel('undici:websocket:close').subscribe(({ websocket, code, reason }) => {
    t.type(websocket, WebSocket)
    t.equal(code, 1000)
    t.equal(reason, 'goodbye')
  })

  const ws = new WebSocket(`ws://localhost:${port}`, 'chat')

  ws.addEventListener('open', () => {
    t.pass('Emitted open')
  })
})
