'use strict'

const { test } = require('node:test')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')
const { once } = require('node:events')

test('check cloned', async (t) => {
  t.plan(2)

  const server = new WebSocketServer({ port: 0 })
  const buffer = new Uint8Array([0x61])

  server.on('connection', (ws) => {
    ws.on('message', (data) => {
      t.assert.deepStrictEqual(data, Buffer.from([0x61]))
      ws.close()
    })
  })

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  ws.addEventListener('open', () => {
    ws.send(new Blob([buffer]))
    ws.send(buffer)
    buffer[0] = 1
  })

  t.after(() => {
    server.close()
    ws.close()
  })

  await once(ws, 'close')
})
