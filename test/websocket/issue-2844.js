'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

test('The server must reply with at least one subprotocol the client sends', (t, done) => {
  t.plan(2)

  const wss = new WebSocketServer({
    handleProtocols: (protocols) => {
      t.assert.deepStrictEqual(protocols, new Set(['msgpack', 'json']))

      return protocols.values().next().value
    },
    port: 0
  })
  t.after(() => {
    wss.close()
  })

  wss.on('connection', (ws) => {
    ws.on('error', t.assert.fail)
    ws.send('something')
  })

  once(wss, 'listening').then(() => {
    const ws = new WebSocket(`ws://localhost:${wss.address().port}`, {
      protocols: ['msgpack', 'json']
    })

    ws.onerror = t.assert.fail
    ws.onopen = () => {
      t.assert.deepStrictEqual(ws.protocol, 'msgpack')
      done()
    }

    t.after(() => {
      ws.close()
    })
  })
})

test('The connection fails when the client sends subprotocols that the server does not responc with', async (t) => {
  const wss = new WebSocketServer({
    handleProtocols: () => false,
    port: 0
  })

  wss.on('connection', (ws) => {
    ws.on('error', t.assert.fail)
    ws.send('something')
  })

  await once(wss, 'listening')

  const ws = new WebSocket(`ws://localhost:${wss.address().port}`, {
    protocols: ['json']
  })

  ws.onerror = t.assert.ok.bind(null, true)
  // The server will try to send 'something', this ensures that the connection
  // fails during the handshake and doesn't receive any messages.
  ws.onmessage = t.assert.fail

  t.after(() => {
    wss.close()
    ws.close()
  })
})
