'use strict'

const assert = require('node:assert')
const { once } = require('node:events')
const { test } = require('node:test')
const { WebSocket } = require('../..')

test('closing before connection is established should only fire error and close events once', async (t) => {
  const events = []
  const ws = new WebSocket('wss://example.com/')
  const closeEvent = once(ws, 'close')

  ws.onopen = t.assert.fail

  ws.addEventListener('error', () => {
    t.assert.ok(true, 'error event fired')
    events.push('error')
  })

  ws.addEventListener('close', () => {
    t.assert.ok(true, 'close event fired')
    events.push('close')
  })

  ws.close()

  await closeEvent

  assert.deepStrictEqual(events, ['error', 'close'])
})
