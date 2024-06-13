'use strict'

const { test } = require('node:test')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')
const diagnosticsChannel = require('node:diagnostics_channel')
const { tspl } = require('@matteo.collina/tspl')

test('Fragmented frame with a ping frame in the first of it', async (t) => {
  const { completed, deepStrictEqual, strictEqual } = tspl(t, { plan: 2 })

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    const socket = ws._socket

    socket.write(Buffer.from([0x89, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f])) // ping "Hello"
    socket.write(Buffer.from([0x01, 0x03, 0x48, 0x65, 0x6c])) // Text frame "Hel"
    socket.write(Buffer.from([0x80, 0x02, 0x6c, 0x6f])) // Text frame "lo"
  })

  t.after(() => {
    server.close()
    ws.close()
  })

  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}`)

  diagnosticsChannel.channel('undici:websocket:ping').subscribe(
    ({ payload }) => deepStrictEqual(payload, Buffer.from('Hello'))
  )

  ws.addEventListener('message', ({ data }) => {
    strictEqual(data, 'Hello')
  })

  await completed
})
