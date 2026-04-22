'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const net = require('node:net')
const { WebSocket } = require('../..')

test('close() during CONNECTING fires error and close asynchronously', async (t) => {
  const sockets = new Set()
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})
  })

  await new Promise((resolve) => server.listen(0, resolve))

  t.after(async () => {
    for (const socket of sockets) {
      socket.destroy()
    }

    await new Promise((resolve) => server.close(resolve))
  })

  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}`)

  let closeReturned = false
  let errorSeen = false
  let closeSeen = false

  ws.addEventListener('error', () => {
    t.assert.ok(closeReturned)
    t.assert.strictEqual(errorSeen, false)
    t.assert.strictEqual(closeSeen, false)
    t.assert.strictEqual(ws.readyState, WebSocket.CLOSED)
    errorSeen = true
  })

  ws.addEventListener('close', () => {
    t.assert.ok(closeReturned)
    t.assert.strictEqual(errorSeen, true)
    t.assert.strictEqual(closeSeen, false)
    t.assert.strictEqual(ws.readyState, WebSocket.CLOSED)
    closeSeen = true
  })

  const closeEvent = once(ws, 'close')

  t.assert.strictEqual(ws.readyState, WebSocket.CONNECTING)

  ws.close()

  t.assert.strictEqual(ws.readyState, WebSocket.CLOSING)
  t.assert.strictEqual(errorSeen, false)
  t.assert.strictEqual(closeSeen, false)
  closeReturned = true

  await closeEvent

  t.assert.strictEqual(ws.readyState, WebSocket.CLOSED)
  t.assert.strictEqual(errorSeen, true)
  t.assert.strictEqual(closeSeen, true)
})
