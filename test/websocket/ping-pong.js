'use strict'

const { test, after } = require('node:test')
const assert = require('node:assert')
const { WebSocketServer } = require('ws')
const diagnosticsChannel = require('diagnostics_channel')
const { WebSocket } = require('../..')

test('Receives ping and parses body', () => {
  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    ws.ping('Hello, world')
  })

  after(server.close.bind(server))

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)
  ws.onerror = ws.onmessage = t.fail

  diagnosticsChannel.channel('undici:websocket:ping').subscribe(({ payload }) => {
    assert.deepStrictEqual(payload, Buffer.from('Hello, world'))
    ws.close()
  })
})

test('Receives pong and parses body', () => {
  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    ws.pong('Pong')
  })

  after(server.close.bind(server))

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)
  ws.onerror = ws.onmessage = t.fail

  diagnosticsChannel.channel('undici:websocket:pong').subscribe(({ payload }) => {
    assert.deepStrictEqual(payload, Buffer.from('Pong'))
    ws.close()
  })
})
