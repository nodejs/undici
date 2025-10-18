'use strict'

const assert = require('node:assert')
const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { WebSocket } = require('../..')

test('closing before connection is established should only fire error and close events once', async (t) => {
  const plan = tspl(t, { plan: 2 })

  const events = []
  const ws = new WebSocket('wss://example.com/')

  ws.onopen = plan.fail

  ws.addEventListener('error', () => {
    plan.ok(true, 'error event fired')
    events.push('error')
  })

  ws.addEventListener('close', () => {
    plan.ok(true, 'close event fired')
    events.push('close')
  })

  ws.close()

  await plan.completed

  assert.deepStrictEqual(events, ['error', 'close'])
})
