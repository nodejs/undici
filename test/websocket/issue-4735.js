'use strict'

const { test } = require('node:test')
const { WebSocket } = require('../..')
const { once } = require('node:events')

test('WebSocket emits error with message when connection cannot be opened', async (t) => {
  t.plan(2)

  const ws = new WebSocket('ws://localhost:1')

  ws.addEventListener('error', ({ error, message }) => {
    t.assert.strictEqual(error.message, 'Received network error or non-101 status code.')
    t.assert.strictEqual(message, 'Received network error or non-101 status code.')
  })

  await once(ws, 'close')
})
