'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { WebSocket } = require('../..')

test('closing before connection is established should only fire error and close events once', async (t) => {
  t = tspl(t, { plan: 2 })

  const ws = new WebSocket('wss://example.com/')

  ws.addEventListener('error', () => {
    t.ok(true, 'error event fired')
  })

  ws.addEventListener('close', () => {
    t.ok(true, 'close event fired')
  })

  // Close immediately before connection is established
  setTimeout(() => {
    ws.close()
  }, 10)

  await t.completed
})
