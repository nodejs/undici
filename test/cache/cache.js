'use strict'

const { throws } = require('node:assert')
const { test } = require('node:test')
const { Cache } = require('../../lib/web/cache/cache')
const { caches, Response } = require('../../')

test('constructor', () => {
  throws(() => new Cache(null), {
    name: 'TypeError',
    message: 'TypeError: Illegal constructor'
  })
})

// https://github.com/nodejs/undici/issues/4710
test('cache.match should work after garbage collection', async (t) => {
  const cache = await caches.open('test-gc-cache')

  t.after(async () => {
    await caches.delete('test-gc-cache')
  })

  const url = 'https://example.com/test-gc'
  const testData = { answer: 42 }

  await cache.put(url, Response.json(testData))

  // Call match multiple times with GC pressure between calls
  // The bug manifests when the temporary Response object from fromInnerResponse()
  // is garbage collected, which triggers the FinalizationRegistry to cancel
  // the cached stream.
  for (let i = 0; i < 20; i++) {
    // Create significant memory pressure to trigger GC
    // eslint-disable-next-line no-unused-vars
    const garbage = Array.from({ length: 30000 }, () => ({ value: Math.random() }))

    // Force GC if available (run with --expose-gc)
    if (global.gc) {
      global.gc()
    }

    // Delay to allow FinalizationRegistry callbacks to run
    // The bug requires time for the GC to collect the temporary Response
    // and for the finalization callback to cancel the stream
    await new Promise((resolve) => setTimeout(resolve, 10))

    // This should not throw "Body has already been consumed"
    const match = await cache.match(url)
    t.assert.ok(match, `Iteration ${i}: match should return a response`)

    const result = await match.json()
    t.assert.deepStrictEqual(result, testData, `Iteration ${i}: response body should match`)
  }
})
