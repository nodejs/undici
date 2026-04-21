'use strict'

const { test, after } = require('node:test')
const { equal, notEqual, deepStrictEqual } = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { request, Agent, interceptors } = require('../../')
const { makeCacheKey } = require('../../lib/util/cache')

// Regression test for https://github.com/nodejs/undici/issues/4209
// The cache interceptor must treat requests with different `query` params
// (or query strings) as distinct cache entries, and must not throw when
// `opts.path` is absent while `opts.query` is provided.

test('issue #4209 - makeCacheKey includes query in key.path', () => {
  const k1 = makeCacheKey({
    origin: 'http://example.com',
    method: 'GET',
    path: '/',
    query: { i: 1 },
    headers: {}
  })
  const k2 = makeCacheKey({
    origin: 'http://example.com',
    method: 'GET',
    path: '/',
    query: { i: 2 },
    headers: {}
  })
  equal(k1.path, '/?i=1')
  equal(k2.path, '/?i=2')
  notEqual(k1.path, k2.path)
})

test('issue #4209 - makeCacheKey does not throw when opts.path is undefined', () => {
  // Previously `pathHasQueryOrFragment(opts.path)` threw when opts.path was
  // undefined, because undefined has no `.includes`. The cache key must be
  // derivable even when only `query` is supplied.
  const key = makeCacheKey({
    origin: 'http://example.com',
    method: 'GET',
    query: { i: 42 },
    headers: {}
  })
  deepStrictEqual(key, {
    origin: 'http://example.com',
    method: 'GET',
    path: '/?i=42',
    headers: {}
  })
})

test('issue #4209 - different query strings do not collide in the cache', async () => {
  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=100'
    })
    // Each response embeds the received URL and a per-request counter so
    // that a cache collision is immediately observable: a cached reply for
    // a different query would carry the wrong URL/counter.
    res.end(`req=${requestCount};url=${req.url}`)
  })

  server.listen(0)
  await once(server, 'listening')

  const dispatcher = new Agent().compose(interceptors.cache())

  after(async () => {
    server.close()
    await dispatcher.close()
  })

  const origin = `http://localhost:${server.address().port}`

  // First request with ?i=0 – hits origin
  const r0 = await request(`${origin}/?i=0`, { dispatcher })
  const b0 = await r0.body.text()
  equal(requestCount, 1, 'first distinct query hits the origin')
  equal(b0, 'req=1;url=/?i=0')

  // Same query repeated – must be served from cache
  const r0b = await request(`${origin}/?i=0`, { dispatcher })
  const b0b = await r0b.body.text()
  equal(requestCount, 1, 'repeated query is served from cache')
  equal(b0b, b0, 'cached body matches original')

  // Different query – must NOT collide with the previous cache entry
  const r1 = await request(`${origin}/?i=1`, { dispatcher })
  const b1 = await r1.body.text()
  equal(requestCount, 2, 'different query goes to origin, not the cache')
  equal(b1, 'req=2;url=/?i=1')
  notEqual(b1, b0, 'different query must produce a different response')

  // And the first one still comes from cache.
  const r0c = await request(`${origin}/?i=0`, { dispatcher })
  const b0c = await r0c.body.text()
  equal(requestCount, 2, 'original query still cached after the new one')
  equal(b0c, b0)
})

test('issue #4209 - query object form also keyed distinctly', async () => {
  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=100'
    })
    res.end(`req=${requestCount};url=${req.url}`)
  })

  server.listen(0)
  await once(server, 'listening')

  const dispatcher = new Agent().compose(interceptors.cache())

  after(async () => {
    server.close()
    await dispatcher.close()
  })

  const origin = `http://localhost:${server.address().port}`

  const r0 = await request(origin, { dispatcher, query: { i: 0 } })
  const b0 = await r0.body.text()
  equal(requestCount, 1)
  equal(b0, 'req=1;url=/?i=0')

  const r1 = await request(origin, { dispatcher, query: { i: 1 } })
  const b1 = await r1.body.text()
  equal(requestCount, 2, 'different query option must bypass cache')
  equal(b1, 'req=2;url=/?i=1')
  notEqual(b0, b1)

  // Re-request first query – served from cache, counter unchanged.
  const r0b = await request(origin, { dispatcher, query: { i: 0 } })
  const b0b = await r0b.body.text()
  equal(requestCount, 2, 'first query still served from cache')
  equal(b0b, b0)
})
