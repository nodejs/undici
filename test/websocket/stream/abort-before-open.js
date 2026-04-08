'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')

const { WebSocketStream } = require('../../..')

test('WebSocketStream aborts before handshake completes', async (t) => {
  const sockets = new Set()
  const server = createServer()

  server.on('upgrade', (req, socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })

  await new Promise((resolve) => server.listen(0, resolve))

  t.after(async () => {
    for (const socket of sockets) {
      socket.destroy()
    }

    await new Promise((resolve) => server.close(resolve))
  })

  const ac = new AbortController()
  const wss = new WebSocketStream(`ws://localhost:${server.address().port}`, {
    signal: ac.signal
  })

  ac.abort(new Error('abort before open'))

  const [opened, closed] = await Promise.allSettled([wss.opened, wss.closed])

  t.assert.strictEqual(opened.status, 'rejected')
  t.assert.strictEqual(opened.reason.name, 'WebSocketError')
  t.assert.strictEqual(opened.reason.message, 'Socket never opened')

  t.assert.strictEqual(closed.status, 'rejected')
  t.assert.strictEqual(closed.reason.name, 'WebSocketError')
  t.assert.strictEqual(closed.reason.message, 'unclean close')
})
