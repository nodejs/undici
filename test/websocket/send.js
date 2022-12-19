'use strict'

const { test } = require('tap')
const { WebSocketServer } = require('ws')
const { Blob } = require('buffer')
const { WebSocket } = require('../..')

test('Sending > 2^16 bytes', (t) => {
  t.plan(3)

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    ws.on('message', (m, isBinary) => {
      ws.send(m, { binary: isBinary })
    })
  })

  const payload = Buffer.allocUnsafe(2 ** 16).fill('Hello')

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  ws.addEventListener('open', () => {
    ws.send(payload)
  })

  ws.addEventListener('message', async ({ data }) => {
    t.type(data, Blob)
    t.equal(data.size, payload.length)
    t.same(Buffer.from(await data.arrayBuffer()), payload)

    ws.close()
    server.close()
  })
})
