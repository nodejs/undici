'use strict'

const { test } = require('tap')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

test('Receiving a frame with a payload length > 2^31-1 bytes', (t) => {
  t.plan(1)

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    const socket = ws._socket

    socket.write(Buffer.from([0x81, 0x7F, 0xCA, 0xE5, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00]))
  })

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  t.teardown(() => {
    ws.close()
    server.close()
  })

  ws.onmessage = t.fail

  ws.addEventListener('error', (event) => {
    t.type(event.error, Error) // error event is emitted
  })
})
