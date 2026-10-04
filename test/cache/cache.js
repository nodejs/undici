'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { Cache } = require('../../lib/web/cache/cache')
const { caches, Response } = require('../../')
const { closeServerAsPromise } = require('../utils/node-http')

test('constructor', (t) => {
  t.assert.throws(() => new Cache(null), {
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

// https://github.com/nodejs/undici/issues/5859
test('cache.match and cache.matchAll work after cache.add and cache.addAll', async (t) => {
  const server = createServer((req, res) => {
    if (req.url === '/empty') {
      res.writeHead(204)
      res.end()
      return
    }
    if (req.url === '/json') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ key: 'val' }))
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('cached text body')
  }).listen(0, '127.0.0.1')

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const base = `http://127.0.0.1:${server.address().port}`
  const cacheName = 'test-add-match'
  const cache = await caches.open(cacheName)

  t.after(async () => {
    await caches.delete(cacheName)
  })

  await cache.add(`${base}/text`)

  const firstMatch = await cache.match(`${base}/text`)
  t.assert.ok(firstMatch)
  t.assert.strictEqual(await firstMatch.text(), 'cached text body')

  const secondMatch = await cache.match(`${base}/text`)
  t.assert.ok(secondMatch)
  t.assert.strictEqual(await secondMatch.text(), 'cached text body')

  await cache.addAll([`${base}/json`, `${base}/empty`])

  const jsonMatch = await cache.match(`${base}/json`)
  t.assert.ok(jsonMatch)
  t.assert.deepStrictEqual(await jsonMatch.json(), { key: 'val' })

  const emptyMatch = await cache.match(`${base}/empty`)
  t.assert.ok(emptyMatch)
  t.assert.strictEqual(emptyMatch.status, 204)
  t.assert.strictEqual(await emptyMatch.text(), '')

  const allMatches = await cache.matchAll()
  t.assert.strictEqual(allMatches.length, 3)
})
