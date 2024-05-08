'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')
const { tspl } = require('@matteo.collina/tspl')
const { WebsocketFrameSend } = require('../../lib/web/websocket/frame')

test('Client fails the connection if receiving a masked frame', async (t) => {
  const assert = tspl(t, { plan: 2 })

  const body = Buffer.allocUnsafe(2)
  body.writeUInt16BE(1006, 0)

  const frame = new WebsocketFrameSend(body)
  const buffer = frame.createFrame(0x8)

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    const socket = ws._socket

    socket.write(buffer, () => ws.close())
  })

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  ws.addEventListener('close', (e) => {
    assert.deepStrictEqual(e.code, 1006)
  })

  ws.addEventListener('error', () => {
    assert.ok(true)
  })

  t.after(() => {
    server.close()
    ws.close()
  })

  await once(ws, 'close')

  await assert.completed
})
