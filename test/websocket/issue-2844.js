'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')
const { tspl } = require('@matteo.collina/tspl')

test('The server must reply with at least one subprotocol the client sends', async (t) => {
  const { completed, deepStrictEqual, fail } = tspl(t, { plan: 2 })

  const wss = new WebSocketServer({
    handleProtocols: (protocols) => {
      deepStrictEqual(protocols, new Set(['msgpack', 'json']))

      return protocols.values().next().value
    },
    port: 0
  })

  wss.on('connection', (ws) => {
    ws.on('error', fail)
    ws.send('something')
  })

  await once(wss, 'listening')

  const ws = new WebSocket(`ws://localhost:${wss.address().port}`, {
    protocols: ['msgpack', 'json']
  })

  ws.onerror = fail
  ws.onopen = () => deepStrictEqual(ws.protocol, 'msgpack')

  t.after(() => {
    wss.close()
    ws.close()
  })

  await completed
})

test('The connection fails when the client sends subprotocols that the server does not responc with', async (t) => {
  const { completed, fail, ok } = tspl(t, { plan: 1 })

  const wss = new WebSocketServer({
    handleProtocols: () => false,
    port: 0
  })

  wss.on('connection', (ws) => {
    ws.on('error', fail)
    ws.send('something')
  })

  await once(wss, 'listening')

  const ws = new WebSocket(`ws://localhost:${wss.address().port}`, {
    protocols: ['json']
  })

  ws.onerror = ok.bind(null, true)
  // The server will try to send 'something', this ensures that the connection
  // fails during the handshake and doesn't receive any messages.
  ws.onmessage = fail

  t.after(() => {
    wss.close()
    ws.close()
  })

  await completed
})
