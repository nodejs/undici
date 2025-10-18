'use strict'

const assert = require('node:assert')
const { test } = require('node:test')
const { WebSocket } = require('../..')

test('closing before connection is established should only fire error and close events once', (t) => {
  t.plan(2)

  t.after(() => assert.deepStrictEqual(events, ['error', 'close']))

  const events = []
  const ws = new WebSocket('wss://example.com/')

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
})
