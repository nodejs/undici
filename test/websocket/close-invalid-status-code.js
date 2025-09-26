'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

test('Client fails the connection if receiving a masked frame', async (t) => {
  t.plan(2)

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    const socket = ws._socket

    // 1006 status code
    socket.write(Buffer.from([0x88, 0x02, 0x03, 0xee]), () => ws.close())
  })

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  ws.addEventListener('close', (e) => {
    t.assert.deepStrictEqual(e.code, 1006)
  })

  ws.addEventListener('error', () => {
    t.assert.ok(true)
  })

  t.after(() => {
    server.close()
    ws.close()
  })

  await once(ws, 'close')
})
