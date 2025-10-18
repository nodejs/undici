'use strict'

const { test } = require('node:test')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

test('Receiving multiple continuation frames works as expected', (t, done) => {
  t.plan(1)

  const frames = [
    Buffer.from([0x01, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f]), // text frame "hello" (fragmented)
    Buffer.from([0x00, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f]), // continuation frame "hello" (fin clear)
    Buffer.from([0x00, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f]), // continuation frame "hello" (fin clear)
    Buffer.from([0x80, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f]) // continuation frame "hello" (fin set)
  ]

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    const socket = ws._socket

    for (const frame of frames) {
      socket.write(frame)
    }
  })

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  ws.onerror = t.assert.fail
  ws.onmessage = (e) => {
    t.assert.deepStrictEqual(e.data, 'hellohellohellohello')
    done()
  }

  t.after(() => {
    server.close()
    ws.close()
  })
})
