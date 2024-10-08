'use strict'

const { test } = require('node:test')
const { WebSocket } = require('../..')
const { tspl } = require('@matteo.collina/tspl')

// https://github.com/nodejs/undici/issues/3697#issuecomment-2399493917
test('closing before a connection is established changes readyState', async (t) => {
  const { completed, strictEqual } = tspl(t, { plan: 1 })

  const ws = new WebSocket('wss://example.com/non-existing-url')
  ws.onclose = () => strictEqual(ws.readyState, WebSocket.CLOSED)

  await completed
})
