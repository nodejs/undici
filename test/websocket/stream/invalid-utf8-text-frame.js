'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { WebSocketServer } = require('ws')
const { WebSocketStream } = require('../../..')

test('WebSocketStream sends close code 1007 when receiving invalid UTF-8 in a text frame', async (t) => {
  const server = new WebSocketServer({ port: 0 })

  t.after(() => server.close())

  const connection = new Promise((resolve) => {
    server.on('connection', (ws) => {
      // Send a text frame with invalid UTF-8 payload (unmasked, server->client).
      // 0x81 = FIN + text opcode, 0x02 = length 2, then 0xFF 0xFE (invalid UTF-8).
      ws._socket.write(Buffer.from([0x81, 0x02, 0xFF, 0xFE]))
      resolve(ws)
    })
  })

  const wss = new WebSocketStream(`ws://127.0.0.1:${server.address().port}`)
  // Swallow the expected unclean-close rejection on the client side.
  wss.closed.catch(() => {})

  await wss.opened

  const ws = await connection
  const [code] = await once(ws, 'close')

  t.assert.strictEqual(code, 1007)
})
