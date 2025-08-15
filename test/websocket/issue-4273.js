'use strict'

const { test } = require('node:test')
const { WebSocket } = require('../..')
const { tspl } = require('@matteo.collina/tspl')

test('first error than close event is fired on failed connection', async (t) => {
  const { completed, ok } = tspl(t, { plan: 1 })
  const ws = new WebSocket('ws://localhost:1')

  ws.addEventListener('error', (ev) => {
    const { cause } = ev.error
    ok(cause instanceof Error)
  })

  await completed
})
