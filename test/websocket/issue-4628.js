'use strict'

const assert = require('node:assert')
const { test } = require('node:test')
const { WebSocket } = require('../..')

test('closing before connection is established should only fire error and close events once', async (t) => {
  t.plan(2)

  const events = []
  const ws = new WebSocket('wss://example.com/')

  ws.onopen = t.assert.fail

  ws.addEventListener('error', () => {
    t.assert.ok(true, 'error event fired')
    events.push('error')
  })

  await new Promise((resolve) => {
    ws.addEventListener('close', () => {
      t.assert.ok(true, 'close event fired')
      events.push('close')
      resolve()
    })

    ws.close()
  })

  assert.deepStrictEqual(events, ['error', 'close'])
})
