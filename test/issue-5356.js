'use strict'

const { test } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')

const { RequestHandler } = require('../lib/api/api-request')

// Regression test for https://github.com/nodejs/undici/issues/5356
//
// When a request is aborted while its body is being consumed (e.g.
// `body.json()`), the abort-signal listener destroys the response stream in
// place but - unlike `onResponseError` - does not null `this.res`. A chunk that
// arrives afterwards (for example flushed asynchronously by the decompress
// interceptor) reached the destroyed stream and crashed synchronously with
// "Cannot read properties of null (reading 'push')" instead of the consume
// promise simply rejecting with the AbortError.
test('a late chunk after an aborted consume is dropped, not pushed into the destroyed stream', { timeout: 30000 }, async (t) => {
  t = tspl(t, { plan: 2 })

  const ac = new AbortController()

  let body = null
  const handler = new RequestHandler(
    { method: 'GET', path: '/', signal: ac.signal },
    (err, data) => {
      if (err == null && data != null) {
        body = data.body
      }
    }
  )

  const controller = {
    resume () {},
    pause () {},
    abort () {}
  }

  handler.onRequestStart(controller, null)
  handler.onResponseStart(controller, 200, { 'content-type': 'application/json' }, 'OK')

  // Start consuming the body, then abort while it is still in flight. The abort
  // listener destroys `res` (the body) while `handler.res` keeps referencing it.
  const consumed = body.json()
  ac.abort()

  // Wait for the destroy to tear the consume down (consume.body becomes null).
  // Listen for 'close' directly: the stream emits 'error' first (the abort
  // reason, already handled by the consume), and events.once would reject on it.
  await new Promise(resolve => body.once('close', resolve))

  // A late chunk - e.g. an asynchronous decompressor flush after teardown - must
  // be dropped because the response stream is destroyed, not pushed into it.
  t.doesNotThrow(() => {
    handler.onResponseData(controller, Buffer.from('{"late":true}'))
  })

  await t.rejects(consumed, (err) => err.name === 'AbortError')

  await t.completed
})
