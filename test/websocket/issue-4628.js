'use strict'

const { once } = require('node:events')
const { test } = require('node:test')
const { WebSocket } = require('../..')

test('closing before connection is established should only fire error and close events once', async (t) => {
  t.plan(3)

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

  const closed = once(ws, 'close')

  ws.close()

  await closed

  t.assert.deepStrictEqual(events, ['error', 'close'])
})

test('closing before connection is established fires events asynchronously', async (t) => {
  t.plan(5)

  const events = []
  const ws = new WebSocket('wss://example.com/')
  let closeMethodReturned = false

  ws.onopen = t.assert.fail

  ws.addEventListener('error', () => {
    events.push(['error', closeMethodReturned])
  })

  ws.addEventListener('close', () => {
    events.push(['close', closeMethodReturned])
  })

  t.assert.strictEqual(ws.readyState, WebSocket.CONNECTING)

  const closed = once(ws, 'close')

  ws.close()
  closeMethodReturned = true

  t.assert.deepStrictEqual(events, [])
  t.assert.strictEqual(ws.readyState, WebSocket.CLOSING)

  await closed

  t.assert.deepStrictEqual(events, [
    ['error', true],
    ['close', true]
  ])
  t.assert.strictEqual(ws.readyState, WebSocket.CLOSED)
})
