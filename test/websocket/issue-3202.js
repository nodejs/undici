'use strict'

const { test } = require('node:test')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')
const { tspl } = require('@matteo.collina/tspl')

test('Receiving frame with payload length 0 works', async (t) => {
  const { ok, completed } = tspl(t, { plan: 1 })

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (socket) => {
    socket.on('message', () => {
      socket.send('')
    })
  })

  t.after(() => {
    server.close()
    ws.close()
  })

  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}`)

  ws.addEventListener('open', () => {
    ws.send('Hi')
  })

  ws.addEventListener('message', () => {
    ok(true)
  })

  await completed
})
