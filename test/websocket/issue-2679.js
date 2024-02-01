'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { once } = require('node:events')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

test('Close without receiving code does not send an invalid payload', async () => {
  const server = new WebSocketServer({ port: 0 })

  await once(server, 'listening')

  server.on('connection', (sock, request) => {
    setTimeout(() => {
      sock.close()
    }, 3000)
  })

  server.on('error', (err) => assert.ifError(err))

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`)
  await once(client, 'open')

  await once(client, 'close')

  server.close()
  await once(server, 'close')
})
