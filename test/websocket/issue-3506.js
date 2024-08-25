'use strict'

const { test } = require('node:test')
const { WebSocket } = require('../..')
const { tspl } = require('@matteo.collina/tspl')

test('readyState is set on fail', async (t) => {
  const { deepStrictEqual, completed } = tspl(t, { plan: 1 })
  const ws = new WebSocket('ws://localhost:1')

  t.after(() => ws.close())

  ws.addEventListener('error', () => {
    deepStrictEqual(ws.readyState, WebSocket.CLOSED)
  })

  await completed
})
