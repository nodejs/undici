'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { fetch } = require('../..')

// https://github.com/nodejs/undici/issues/6196
// When undici is loaded and `globalThis.URL` is later replaced (e.g. by a URL
// polyfill), a valid `referrer` no longer passes undici's `webidl.is.URL`
// check, so `mainFetch` throws internally. That exception must settle the
// promise returned by `fetch()` (by rejecting it) rather than leaving it
// pending forever.
test('fetch rejects when an internal error occurs in mainFetch', async (t) => {
  const NativeURL = globalThis.URL

  // A stand-in for a URL polyfill installed after undici was loaded. The new
  // constructor produces objects that are not instances of the native `URL`
  // captured by undici at load time.
  function ReplacementURL (...args) {
    const url = new NativeURL(...args)
    Object.setPrototypeOf(url, ReplacementURL.prototype)
    return url
  }
  Object.defineProperties(
    ReplacementURL.prototype,
    Object.getOwnPropertyDescriptors(NativeURL.prototype)
  )
  Object.setPrototypeOf(ReplacementURL, NativeURL)

  globalThis.URL = ReplacementURL
  t.after(() => {
    globalThis.URL = NativeURL
  })

  await assert.rejects(
    fetch('data:,ok', { referrer: 'https://example.com/' }),
    (error) => {
      assert.strictEqual(error.message, 'fetch failed')
      // The internal failure must be surfaced as the cause rather than being
      // silently swallowed.
      assert.ok(error.cause instanceof Error)
      return true
    }
  )
})
