'use strict'

const { test } = require('node:test')
const { WebSocket } = require('../..')
const { tspl } = require('@matteo.collina/tspl')

test('first error than close event is fired on failed connection', async (t) => {
  const { completed, strictEqual } = tspl(t, { plan: 4 })
  const ws = new WebSocket('ws://localhost:1')

  let orderOfEvents = 0

  ws.addEventListener('error', () => {
    strictEqual(orderOfEvents++, 0)
    strictEqual(ws.readyState, WebSocket.CLOSED)
  })

  ws.addEventListener('close', () => {
    strictEqual(orderOfEvents++, 1)
    strictEqual(ws.readyState, WebSocket.CLOSED)
  })

  await completed
})
