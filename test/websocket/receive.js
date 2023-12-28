'use strict'

const { test, after } = require('node:test')
const assert = require('node:assert')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

test('Receiving a frame with a payload length > 2^31-1 bytes', () => {
  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    const socket = ws._socket

    socket.write(Buffer.from([0x81, 0x7F, 0xCA, 0xE5, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00]))
  })

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  after(() => {
    ws.close()
    server.close()
  })

  ws.onmessage = assert.fail

  ws.addEventListener('error', (event) => {
    assert.ok(event.error instanceof Error) // error event is emitted
  })
})

test('Receiving an ArrayBuffer', () => {
  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    ws.on('message', (data, isBinary) => {
      ws.send(data, { binary: true })

      ws.close(1000)
    })
  })

  after(server.close.bind(server))
  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  ws.addEventListener('open', () => {
    ws.binaryType = 'what'
    assert.equal(ws.binaryType, 'blob')

    ws.binaryType = 'arraybuffer' // <--
    ws.send('Hello')
  })

  ws.addEventListener('message', ({ data }) => {
    assert.ok(data instanceof ArrayBuffer)
    assert.deepStrictEqual(Buffer.from(data), Buffer.from('Hello'))
  })
})
