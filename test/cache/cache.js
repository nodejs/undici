'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { setTimeout: sleep } = require('node:timers/promises')
const { Cache } = require('../../lib/web/cache/cache')
const { caches, Request, Response } = require('../../')
const { closeServerAsPromise } = require('../utils/node-http')

test('constructor', (t) => {
  t.assert.throws(() => new Cache(null), {
    name: 'TypeError',
    message: 'TypeError: Illegal constructor'
  })
})

for (const invalidUrl of ['invalid-url', 'ftp://example.com/']) {
  test(`cache.addAll validates ${invalidUrl} before starting fetches`, async (t) => {
    let requests = 0
    const server = createServer((req, res) => {
      requests++
      res.writeHead(404).end()
    }).listen(0, '127.0.0.1')

    t.after(closeServerAsPromise(server))
    await once(server, 'listening')

    const cache = await caches.open('invalid-url')
    t.after(() => caches.delete('invalid-url'))

    const url = `http://127.0.0.1:${server.address().port}/`
    await t.assert.rejects(cache.addAll([url, invalidUrl]), TypeError)

    await sleep(100)
    t.assert.strictEqual(requests, 0)
  })
}

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

test('failed cache.addAll rollback preserves shared CacheStorage backing list', async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(`server:${req.url}`)
  }).listen(0, '127.0.0.1')

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const base = `http://127.0.0.1:${server.address().port}`
  const cacheName = 'test-batch-rollback'
  const cache = await caches.open(cacheName)

  t.after(async () => {
    await caches.delete(cacheName)
  })

  const sameCache = await caches.open(cacheName)

  const existing1 = `${base}/existing-1`
  const existing2 = `${base}/existing-2`
  const transient = `${base}/transient`
  const afterFromOriginal = `${base}/after-original`
  const afterFromSecond = `${base}/after-second`

  await cache.put(existing1, new Response('body-1'))
  await cache.put(existing2, new Response('body-2'))

  // First operation overwrites existing1, second adds transient,
  // third duplicates existing1 and triggers InvalidStateError rollback.
  await t.assert.rejects(
    cache.addAll([existing1, transient, existing1]),
    { name: 'InvalidStateError' }
  )

  const reopened = await caches.open(cacheName)

  for (const handle of [cache, sameCache, reopened]) {
    t.assert.deepStrictEqual((await handle.keys()).map(r => r.url), [existing1, existing2])
    const res1 = await handle.match(existing1)
    const res2 = await handle.match(existing2)
    t.assert.ok(res1)
    t.assert.ok(res2)
    t.assert.strictEqual(await res1.text(), 'body-1')
    t.assert.strictEqual(await res2.text(), 'body-2')
    t.assert.strictEqual(await handle.match(transient), undefined)
  }

  const fromStorage = await caches.match(existing1)
  t.assert.ok(fromStorage)
  t.assert.strictEqual(await fromStorage.text(), 'body-1')

  const fromNamedStorage = await caches.match(existing2, { cacheName })
  t.assert.ok(fromNamedStorage)
  t.assert.strictEqual(await fromNamedStorage.text(), 'body-2')

  t.assert.strictEqual(await caches.match(transient), undefined)

  // Original handle must remain attached to the shared CacheStorage backing list.
  await cache.put(afterFromOriginal, new Response('from-original'))
  const storageAfterOriginal = await caches.match(afterFromOriginal, { cacheName })
  t.assert.ok(storageAfterOriginal)
  t.assert.strictEqual(await storageAfterOriginal.text(), 'from-original')

  const sameHandleAfterOriginal = await sameCache.match(afterFromOriginal)
  t.assert.ok(sameHandleAfterOriginal)
  t.assert.strictEqual(await sameHandleAfterOriginal.text(), 'from-original')

  // Writes via another handle must remain visible through the original handle.
  await sameCache.put(afterFromSecond, new Response('from-second'))
  const originalAfterSecond = await cache.match(afterFromSecond)
  t.assert.ok(originalAfterSecond)
  t.assert.strictEqual(await originalAfterSecond.text(), 'from-second')
})

test('failed cache.addAll on an empty cache keeps the handle attached to CacheStorage', async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
  }).listen(0, '127.0.0.1')

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const base = `http://127.0.0.1:${server.address().port}`
  const cacheName = 'test-empty-batch-rollback'
  const cache = await caches.open(cacheName)

  t.after(async () => {
    await caches.delete(cacheName)
  })

  const sibling = await caches.open(cacheName)
  const dupUrl = `${base}/dup`

  await t.assert.rejects(
    cache.addAll([dupUrl, dupUrl]),
    { name: 'InvalidStateError' }
  )

  for (const handle of [cache, sibling, await caches.open(cacheName)]) {
    t.assert.deepStrictEqual(await handle.keys(), [])
    t.assert.strictEqual(await handle.match(dupUrl), undefined)
  }
  t.assert.strictEqual(await caches.match(dupUrl), undefined)
  t.assert.strictEqual(await caches.match(dupUrl, { cacheName }), undefined)

  const fromOriginal = `${base}/from-original`
  await cache.put(fromOriginal, new Response('original'))

  for (const match of [
    await caches.match(fromOriginal),
    await caches.match(fromOriginal, { cacheName }),
    await sibling.match(fromOriginal),
    await (await caches.open(cacheName)).match(fromOriginal)
  ]) {
    t.assert.ok(match)
    t.assert.strictEqual(await match.text(), 'original')
  }

  const fromSibling = `${base}/from-sibling`
  await sibling.put(fromSibling, new Response('sibling'))
  const seenByOriginal = await cache.match(fromSibling)
  t.assert.ok(seenByOriginal)
  t.assert.strictEqual(await seenByOriginal.text(), 'sibling')
})

test('failed cache.addAll rollback restores entries after fragment and Vary duplicates', async (t) => {
  const server = createServer((req, res) => {
    if (req.url === '/vary') {
      res.writeHead(200, { 'content-type': 'text/plain', vary: 'accept-language' })
      res.end(`server-vary:${req.headers['accept-language'] ?? ''}`)
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(`server:${req.url}`)
  }).listen(0, '127.0.0.1')

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const base = `http://127.0.0.1:${server.address().port}`
  const cacheName = 'test-fragment-vary-batch-rollback'
  const cache = await caches.open(cacheName)

  t.after(async () => {
    await caches.delete(cacheName)
  })

  const sibling = await caches.open(cacheName)
  const itemUrl = `${base}/item`
  const varyUrl = `${base}/vary`

  await cache.put(itemUrl, new Response('saved-item'))
  await cache.put(
    new Request(varyUrl, { headers: { 'accept-language': 'en' } }),
    new Response('saved-en', { headers: { vary: 'accept-language' } })
  )
  await cache.put(
    new Request(varyUrl, { headers: { 'accept-language': 'fr' } }),
    new Response('saved-fr', { headers: { vary: 'accept-language' } })
  )

  // Fragment-only duplicates collide in #queryCache(..., addedItems).
  await t.assert.rejects(
    cache.addAll([`${itemUrl}#a`, `${itemUrl}#b`]),
    { name: 'InvalidStateError' }
  )

  for (const handle of [cache, sibling, await caches.open(cacheName)]) {
    t.assert.deepStrictEqual((await handle.keys()).map(r => r.url), [itemUrl, varyUrl, varyUrl])
    const itemRes = await handle.match(itemUrl)
    t.assert.ok(itemRes)
    t.assert.strictEqual(await itemRes.text(), 'saved-item')
  }

  // Vary-matching duplicates collide in #queryCache(..., addedItems),
  // rolling back both the transient `de` entry and the overwritten `en` entry.
  await t.assert.rejects(
    cache.addAll([
      new Request(varyUrl, { headers: { 'accept-language': 'de' } }),
      new Request(varyUrl, { headers: { 'accept-language': 'en' } }),
      new Request(varyUrl, { headers: { 'accept-language': 'en' } })
    ]),
    { name: 'InvalidStateError' }
  )

  const reopened = await caches.open(cacheName)
  for (const handle of [cache, sibling, reopened]) {
    t.assert.deepStrictEqual((await handle.keys()).map(r => r.url), [itemUrl, varyUrl, varyUrl])
    const itemRes = await handle.match(itemUrl)
    const enRes = await handle.match(new Request(varyUrl, { headers: { 'accept-language': 'en' } }))
    const frRes = await handle.match(new Request(varyUrl, { headers: { 'accept-language': 'fr' } }))
    const deRes = await handle.match(new Request(varyUrl, { headers: { 'accept-language': 'de' } }))
    t.assert.ok(itemRes)
    t.assert.ok(enRes)
    t.assert.ok(frRes)
    t.assert.strictEqual(deRes, undefined)
    t.assert.strictEqual(await itemRes.text(), 'saved-item')
    t.assert.strictEqual(await enRes.text(), 'saved-en')
    t.assert.strictEqual(await frRes.text(), 'saved-fr')
  }

  const storageEn = await caches.match(
    new Request(varyUrl, { headers: { 'accept-language': 'en' } }),
    { cacheName }
  )
  t.assert.ok(storageEn)
  t.assert.strictEqual(await storageEn.text(), 'saved-en')
  t.assert.strictEqual(
    await caches.match(new Request(varyUrl, { headers: { 'accept-language': 'de' } }), { cacheName }),
    undefined
  )
})
