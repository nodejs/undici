'use strict'

const { test } = require('node:test')
const { WebSocket } = require('../..')
const { once } = require('node:events')

// https://github.com/nodejs/undici/issues/3697#issuecomment-2399493917
test('closing before a connection is established changes readyState', async (t) => {
  t.plan(1)

  const ws = new WebSocket('wss://localhost')
  ws.onclose = () => {
    t.assert.strictEqual(ws.readyState, WebSocket.CLOSED)
  }

  await once(ws, 'close')
})
