'use strict'

const { test } = require('node:test')
const { WebSocket } = require('../..')

// https://github.com/nodejs/undici/issues/4741
//
// When close() is invoked on a WebSocket that is still in the CONNECTING state,
// the error and close events must be fired asynchronously (by queuing a task),
// not synchronously from inside the close() call.
//
// See:
//   - https://websockets.spec.whatwg.org/#feedback-from-the-protocol
//   - https://github.com/web-platform-tests/wpt/blob/master/websockets/interfaces/WebSocket/close/close-connecting-async.any.js

test('close() while CONNECTING fires error and close events asynchronously', (t, done) => {
  t.plan(5)

  // An unreachable wss address so the connection cannot complete before close().
  const ws = new WebSocket('wss://example.invalid/')

  let closeReturned = false
  const order = []

  ws.addEventListener('error', () => {
    order.push('error')
    t.assert.strictEqual(
      closeReturned,
      true,
      'error must fire after close() has already returned'
    )
  })

  ws.addEventListener('close', () => {
    order.push('close')
    t.assert.strictEqual(
      closeReturned,
      true,
      'close must fire after close() has already returned'
    )
    t.assert.deepStrictEqual(order, ['error', 'close'], 'event order is error then close')
    done()
  })

  ws.close()
  closeReturned = true

  // Synchronously after close() returns, no events should have been dispatched.
  t.assert.deepStrictEqual(order, [], 'no events dispatched synchronously from close()')
  t.assert.strictEqual(
    ws.readyState,
    WebSocket.CLOSING,
    'readyState should be CLOSING synchronously after close()'
  )
})
