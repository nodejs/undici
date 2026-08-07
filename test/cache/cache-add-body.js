'use strict'

// Regression test for https://github.com/nodejs/undici/issues/5615
// Cache.add() and Cache.addAll() never settled for a response with a body
// because fetchFinale's finished() listener waited for the body stream to
// close but nothing drained it, causing a deadlock.

const { test } = require('node:test')
const { createServer } = require('node:http')
const { caches } = require('../../')

function withTimeout (p, label, ms = 3000) {
  return Promise.race([
    p.then(() => ({ label, settled: true })),
    new Promise(resolve => setTimeout(() => resolve({ label, settled: false }), ms))
  ])
}

test('Cache.add() settles for a 200 response with a body', async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello from cache')
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const cacheName = 'test-add-body-5615-a'

  t.after(async () => {
    await caches.delete(cacheName)
    await new Promise(resolve => server.close(resolve))
  })

  const cache = await caches.open(cacheName)

  const result = await withTimeout(cache.add(`${base}/`), 'cache.add(200 body)')
  t.assert.ok(result.settled, 'cache.add() should settle for a 200 response with a body')

  // Verify the response was actually stored
  const match = await cache.match(`${base}/`)
  t.assert.ok(match, 'cache.match() should find the stored response')
  const text = await match.text()
  t.assert.strictEqual(text, 'hello from cache', 'stored body should be readable')
})

test('Cache.addAll() settles for a 200 response with a body', async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello from addAll')
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const cacheName = 'test-add-body-5615-b'

  t.after(async () => {
    await caches.delete(cacheName)
    await new Promise(resolve => server.close(resolve))
  })

  const cache = await caches.open(cacheName)

  const result = await withTimeout(cache.addAll([`${base}/`]), 'cache.addAll([200 body])')
  t.assert.ok(result.settled, 'cache.addAll() should settle for a 200 response with a body')

  const match = await cache.match(`${base}/`)
  t.assert.ok(match, 'cache.match() should find the stored response')
  const text = await match.text()
  t.assert.strictEqual(text, 'hello from addAll', 'stored body should be readable')
})

test('Cache.add() still settles for a 204 response (no body)', async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(204)
    res.end()
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const cacheName = 'test-add-body-5615-c'

  t.after(async () => {
    await caches.delete(cacheName)
    await new Promise(resolve => server.close(resolve))
  })

  const cache = await caches.open(cacheName)

  const result = await withTimeout(cache.add(`${base}/`), 'cache.add(204 no body)')
  t.assert.ok(result.settled, 'cache.add() should settle for a 204 response')
})

test('Cache.addAll() with multiple URLs all settle', async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(`response for ${req.url}`)
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const cacheName = 'test-add-body-5615-d'

  t.after(async () => {
    await caches.delete(cacheName)
    await new Promise(resolve => server.close(resolve))
  })

  const cache = await caches.open(cacheName)
  const urls = [`${base}/one`, `${base}/two`, `${base}/three`]

  const result = await withTimeout(cache.addAll(urls), 'cache.addAll([3 urls])')
  t.assert.ok(result.settled, 'cache.addAll() should settle for multiple URLs')

  const keys = await cache.keys()
  t.assert.strictEqual(keys.length, 3, 'all 3 URLs should be stored in cache')
})
