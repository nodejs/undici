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
