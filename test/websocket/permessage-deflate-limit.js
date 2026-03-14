'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

test('Compressed message under limit decompresses successfully', async (t) => {
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: true
  })

  t.after(() => server.close())

  await once(server, 'listening')

  server.on('connection', (ws) => {
    // Send 1 KB of data (well under any reasonable limit)
    ws.send(Buffer.alloc(1024, 0x41), { binary: true })
  })

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`)

  const [event] = await once(client, 'message')
  t.assert.strictEqual(event.data.size, 1024)
  client.close()
})
