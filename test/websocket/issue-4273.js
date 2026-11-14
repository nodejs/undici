'use strict'

const { test } = require('node:test')
const { WebSocket } = require('../..')
const { once } = require('node:events')

test('first error than close event is fired on failed connection', async (t) => {
  t.plan(3)

  const ws = new WebSocket('ws://localhost:999')

  ws.addEventListener('error', (ev) => {
    t.assert.ok(ev.error instanceof TypeError)
    t.assert.ok(ev.error.cause, 'error should have a cause')
    t.assert.strictEqual(ev.error.cause.code, 'ECONNREFUSED', 'error should have a cause code of ECONNREFUSED')
  })

  await once(ws, 'close')
})
