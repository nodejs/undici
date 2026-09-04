'use strict'

// Regression test: when the `data` argument of `.reply(statusCode, data)` is a
// function that returns a promise, and that promise rejects, the dispatch must
// settle with a response error instead of hanging forever (and leaking an
// `unhandledRejection`).
//
// The fulfilment arm of the promise is already awaited in
// `lib/mock/mock-utils.js` `handleReply()`, and the `.reply(200, async () => ...)`
// data-function form is exercised elsewhere (see test/mock-agent.js), but the
// rejection arm was missing, so a throwing async data function never called any
// terminal `onResponse*` callback. This mirrors the reply-options-callback path,
// which handles both fulfilment and rejection.

const { test } = require('node:test')
const assert = require('node:assert')
const { MockAgent, setGlobalDispatcher, getGlobalDispatcher, request } = require('..')

test('reply data-function returning a rejected promise settles the request', { timeout: 15000 }, async (t) => {
  const original = getGlobalDispatcher()
  t.after(() => setGlobalDispatcher(original))

  // If the rejection escapes to the process (the pre-fix hang symptom, where the
  // promise is never given a rejection handler) this listener records it so the
  // assertion below fails deterministically instead of the failure being flaky.
  let unhandled = null
  const onUnhandled = (err) => { unhandled = err }
  process.on('unhandledRejection', onUnhandled)
  t.after(() => process.removeListener('unhandledRejection', onUnhandled))

  const mockAgent = new MockAgent()
  mockAgent.disableNetConnect()
  t.after(() => mockAgent.close())
  setGlobalDispatcher(mockAgent)

  const boom = new Error('boom')
  let calls = 0
  mockAgent
    .get('http://localhost:3000')
    .intercept({ path: '/', method: 'GET' })
    .reply(200, async () => {
      calls++
      throw boom
    })

  // On the unfixed code this promise never settles; the test's `timeout` makes
  // that hang a deterministic failure. With the fix it rejects with `boom`.
  await assert.rejects(
    request('http://localhost:3000/', { method: 'GET' }),
    (err) => {
      assert.strictEqual(err, boom, 'the request must reject with the thrown error')
      return true
    }
  )

  // The data function must have been invoked exactly once (no re-run loop),
  // i.e. exactly one terminal error was produced.
  assert.strictEqual(calls, 1)

  // Give any stray rejection a turn to surface, then assert none did.
  await new Promise((resolve) => setImmediate(resolve))
  assert.strictEqual(unhandled, null, 'the rejection must not become an unhandledRejection')
})
