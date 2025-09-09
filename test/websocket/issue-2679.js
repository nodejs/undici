'use strict'

const { test, after } = require('node:test')
const assert = require('node:assert')
const { once } = require('node:events')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

test('Close without receiving code does not send an invalid payload', async () => {
  const server = new WebSocketServer({ port: 0 })
  after(() => {
    server.close()
    return once(server, 'close')
  })

  await once(server, 'listening')

  server.on('connection', (sock, request) => {
    sock.close()
  })

  server.on('error', (err) => assert.ifError(err))

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`)
  await once(client, 'open')

  await once(client, 'close')
})
