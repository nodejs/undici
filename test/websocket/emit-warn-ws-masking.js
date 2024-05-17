'use strict'

const { once } = require('node:events')
const { WebSocket } = require('../..')
const { test } = require('node:test')
const { closeServerAsPromise } = require('../utils/node-http')
const { strictEqual } = require('node:assert')
const { WebSocketServer } = require('ws')

test('WebSocket optimization using `ws-masking` is experimental, emit warning', async (t) => {
  process.env.UNDICI_USE_WS_MASKING = true
  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (socket) => {
    socket.onmessage = (ev) => {
      socket.send('Hi')
      socket.close()
    }
  })

  await once(server, 'listening')

  t.after(closeServerAsPromise(server))

  let warningEmitted = false
  function onWarning () {
    warningEmitted = true
  }
  process.on('warning', onWarning)
  t.after(() => {
    delete process.env.UNDICI_USE_WS_MASKING
    process.off('warning', onWarning)
  })

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  await new Promise((resolve, reject) => {
    ws.onopen = () => {
      ws.send('Hi')
    }
    ws.onmessage = (ev) => {
      resolve()
    }
    ws.onerror = reject
  })

  ws.close()

  strictEqual(warningEmitted, true)
})
