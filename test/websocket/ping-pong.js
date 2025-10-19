'use strict'

const { test } = require('node:test')
const { WebSocketServer } = require('ws')
const diagnosticsChannel = require('node:diagnostics_channel')
const { WebSocket } = require('../..')

test('Receives ping and parses body', (t) => {
  return new Promise((resolve, reject) => {
    const server = new WebSocketServer({ port: 0 })

    server.on('connection', (ws) => {
      ws.ping('Hello, world')
    })

    const ws = new WebSocket(`ws://localhost:${server.address().port}`)
    ws.onerror = ws.onmessage = reject

    diagnosticsChannel.channel('undici:websocket:ping').subscribe(({ payload }) => {
      t.assert.deepStrictEqual(payload, Buffer.from('Hello, world'))
      ws.close()
      server.close()
      resolve()
    })
  })
})

test('Receives pong and parses body', (t) => {
  return new Promise((resolve, reject) => {
    const server = new WebSocketServer({ port: 0 })

    server.on('connection', (ws) => {
      ws.pong('Pong')
    })

    const ws = new WebSocket(`ws://localhost:${server.address().port}`)
    ws.onerror = ws.onmessage = reject

    diagnosticsChannel.channel('undici:websocket:pong').subscribe(({ payload }) => {
      t.assert.deepStrictEqual(payload, Buffer.from('Pong'))
      server.close()
      ws.close()
      resolve()
    })
  })
})
