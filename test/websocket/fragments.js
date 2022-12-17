'use strict'

const { test } = require('tap')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')
const diagnosticsChannel = require('diagnostics_channel')

test('Fragmented frame with a ping frame in the middle of it', (t) => {
  t.plan(2)

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    const socket = ws._socket

    socket.write(Buffer.from([0x01, 0x03, 0x48, 0x65, 0x6c])) // Text frame "Hel"
    socket.write(Buffer.from([0x89, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f])) // ping "Hello"
    socket.write(Buffer.from([0x80, 0x02, 0x6c, 0x6f])) // Text frame "lo"
  })

  t.teardown(() => {
    for (const client of server.clients) {
      client.close()
    }

    server.close()
  })

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  ws.addEventListener('message', ({ data }) => {
    t.same(data, 'Hello')

    ws.close()
  })

  diagnosticsChannel.channel('undici:websocket:ping').subscribe(
    ({ payload }) => t.same(payload, Buffer.from('Hello'))
  )
})
