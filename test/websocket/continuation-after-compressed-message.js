'use strict'

const { test } = require('node:test')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

test('A continuation frame after a complete compressed message fails the connection', (t, done) => {
  t.plan(3)

  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: { threshold: 0 }
  })

  server.on('connection', (ws) => {
    ws.on('close', (code, reason) => {
      t.assert.strictEqual(code, 1002)
      t.assert.strictEqual(reason.toString(), 'Unexpected continuation frame')
    })

    ws.send('hello', () => {
      // No fragmented message is in progress, so a bare continuation frame
      // must fail the connection rather than start a message.
      ws._socket.write(Buffer.from([0x80, 0x00]))
    })
  })

  const client = new WebSocket(`ws://localhost:${server.address().port}`)

  client.onmessage = (e) => {
    t.assert.strictEqual(e.data, 'hello')
  }

  client.onclose = () => done()

  t.after(() => {
    server.close()
  })
})
