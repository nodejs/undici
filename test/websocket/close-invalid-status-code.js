'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

test('Client fails the connection if receiving an invalid close status code', async (t) => {
  const invalidCloseFrame = Buffer.from([0x88, 0x02, 0x03, 0xee])
  const server = new WebSocketServer({ port: 0 })

  t.after(() => {
    for (const client of server.clients) {
      client.terminate()
    }

    server.close()
  })

  await once(server, 'listening')

  server.on('connection', (serverWs) => {
    // 1006 status code
    serverWs._socket.end(invalidCloseFrame)
  })

  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}`)
  t.after(() => ws.close())

  const [[errorEvent], [closeEvent]] = await Promise.all([
    once(ws, 'error'),
    once(ws, 'close')
  ])

  t.assert.ok(errorEvent)
  t.assert.strictEqual(closeEvent.code, 1006)
})
