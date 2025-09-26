'use strict'

const { test } = require('node:test')
const { once } = require('node:events')

const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

test('should be emit error event on aborted connection', async (t) => {
  const wss = new WebSocketServer({ port: 0 })

  t.after(() => wss.close())

  wss.on('connection', (ws) => ws.terminate())

  await once(wss, 'listening')

  const ws = new WebSocket(`http://localhost:${wss.address().port}`)

  let errorEmitted = false
  // eslint-disable-next-line no-return-assign
  ws.onerror = () => errorEmitted = true
  await once(ws, 'close')

  t.assert.ok(errorEmitted)
})
