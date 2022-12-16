'use strict'

const { test } = require('tap')
const { WebSocketServer } = require('ws')
const diagnosticsChannel = require('diagnostics_channel')
const { WebSocket } = require('../..')

test('Receives ping and parses body', (t) => {
  t.plan(1)

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    ws.ping('Hello, world')

    ws._socket.destroy()
    server._server.close()
  })

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)
  ws.onerror = ws.onmessage = t.fail

  diagnosticsChannel.channel('undici:websocket:ping').subscribe(({ payload }) => {
    t.same(payload, Buffer.from('Hello, world'))
  })
})

test('Receives pong and parses body', (t) => {
  t.plan(1)

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    ws.pong('Pong')

    ws._socket.destroy()
    server._server.close()
  })

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)
  ws.onerror = ws.onmessage = t.fail

  diagnosticsChannel.channel('undici:websocket:pong').subscribe(({ payload }) => {
    t.same(payload, Buffer.from('Pong'))
  })
})
