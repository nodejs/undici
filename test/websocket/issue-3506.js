'use strict'

const { test } = require('node:test')
const { WebSocket } = require('../..')

test('readyState is set on fail', (t, done) => {
  t.plan(1)
  const ws = new WebSocket('ws://localhost:1')

  t.after(() => ws.close())

  ws.addEventListener('error', () => {
    t.assert.deepStrictEqual(ws.readyState, WebSocket.CLOSED)
    done()
  })
})
