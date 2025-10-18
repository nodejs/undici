'use strict'

const { test } = require('node:test')
const { WebSocket } = require('../..')
const { once } = require('node:events')

test('first error than close event is fired on failed connection', async (t) => {
  t.plan(1)

  const ws = new WebSocket('ws://localhost:1')

  ws.addEventListener('error', (ev) => {
    t.assert.ok(ev.error instanceof TypeError)
  })

  await once(ws, 'close')
})
