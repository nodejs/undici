'use strict'

const { test } = require('node:test')
const { WebSocket } = require('../..')
const { once } = require('node:events')

test('first error than close event is fired on failed connection', async (t) => {
  t.plan(4)
  const ws = new WebSocket('ws://localhost:1')

  let orderOfEvents = 0

  ws.addEventListener('error', () => {
    t.assert.strictEqual(orderOfEvents++, 0)
    t.assert.strictEqual(ws.readyState, WebSocket.CLOSED)
  })

  ws.addEventListener('close', () => {
    t.assert.strictEqual(orderOfEvents++, 1)
    t.assert.strictEqual(ws.readyState, WebSocket.CLOSED)
  })

  await once(ws, 'close')
})
