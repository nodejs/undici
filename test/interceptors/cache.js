'use strict'

const { createServer } = require('node:http')
const { describe, test, after } = require('node:test')
const { once } = require('node:events')
const { equal, strictEqual, notEqual, fail } = require('node:assert')
const { setTimeout: sleep } = require('node:timers/promises')
const FakeTimers = require('@sinonjs/fake-timers')
const { Client, interceptors, cacheStores: { MemoryCacheStore, SqliteCacheStore } } = require('../../index')
const { makeCacheKey } = require('../../lib/util/cache.js')
const { runtimeFeatures } = require('../../lib/util/runtime-features.js')

describe('Cache Interceptor', () => {
  test('caches request', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
      requestsToOrigin++
      res.setHeader('cache-control', 's-maxage=10')
      res.end('asd')
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    // Sanity check
    equal(requestsToOrigin, 0)

    /**
     * @type {import('../../types/dispatcher').default.RequestOptions}
     */
    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    {
      const res = await client.request(request)
      equal(requestsToOrigin, 1)
      strictEqual(await res.body.text(), 'asd')
    }

    {
      const res = await client.request(request)
      equal(requestsToOrigin, 1)
      strictEqual(await res.body.text(), 'asd')
    }
  })

  test('vary directives used to decide which response to use', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      requestsToOrigin++
      res.setHeader('cache-control', 's-maxage=10')
      res.setHeader('vary', 'a')

      if (req.headers.a === 'asd123') {
        res.end('asd')
      } else {
        res.end('dsa')
      }
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    /**
     * @type {import('../../types/dispatcher').default.RequestOptions}
     */
    const requestA = {
      origin: 'localhost',
      method: 'GET',
      path: '/',
      headers: {
        a: 'asd123'
      }
    }

    /**
     * @type {import('../../types/dispatcher').default.RequestOptions}
     */
    const requestB = {
      origin: 'localhost',
      method: 'GET',
      path: '/',
      headers: {
        a: 'dsa'
      }
    }

    // Should reach origin
    {
      const res = await client.request(requestA)
      equal(requestsToOrigin, 1)
      strictEqual(await res.body.text(), 'asd')
    }

    // Should reach origin
    {
      const res = await client.request(requestB)
      equal(requestsToOrigin, 2)
      strictEqual(await res.body.text(), 'dsa')
    }

    // Should be cached
    {
      const res = await client.request(requestA)
      equal(requestsToOrigin, 2)
      strictEqual(await res.body.text(), 'asd')
    }

    // Should be cached
    {
      const res = await client.request(requestB)
      equal(requestsToOrigin, 2)
      strictEqual(await res.body.text(), 'dsa')
    }
  })

  test('stale-while-revalidate 304 preserves cached Vary metadata', async () => {
    const clock = FakeTimers.install({
      toFake: ['Date']
    })

    let requestsToOrigin = 0
    let revalidationRequests = 0
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.setHeader('date', new Date().toUTCString())
      res.setHeader('cache-control', 'public, max-age=1, stale-while-revalidate=60')
      res.setHeader('etag', '"cached"')

      if (req.headers['if-none-match'] || req.headers['if-modified-since']) {
        revalidationRequests++
        res.statusCode = 304
        res.end()
        return
      }

      requestsToOrigin++
      res.setHeader('vary', 'cookie')
      res.end(`hit ${requestsToOrigin}: ${req.headers.cookie}`)
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
      clock.uninstall()
    })

    await once(server, 'listening')

    const request = cookie => ({
      origin: 'localhost',
      method: 'GET',
      path: '/',
      headers: {
        cookie
      }
    })

    {
      const res = await client.request(request('session=a'))
      equal(requestsToOrigin, 1)
      strictEqual(await res.body.text(), 'hit 1: session=a')
    }

    clock.tick(1500)

    {
      const res = await client.request(request('session=a'))
      equal(requestsToOrigin, 1)
      strictEqual(await res.body.text(), 'hit 1: session=a')
    }

    await sleep(100)
    equal(revalidationRequests, 1)

    {
      const res = await client.request(request('session=b'))
      equal(requestsToOrigin, 2)
      strictEqual(await res.body.text(), 'hit 2: session=b')
    }
  })

  test('Vary array-valued request headers are matched by value, not mutable reference', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      requestsToOrigin++
      res.setHeader('cache-control', 'public, max-age=60')
      res.setHeader('vary', 'cookie')
      res.end(`hit ${requestsToOrigin}: ${req.headers.cookie}`)
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const headers = {
      cookie: ['session=a']
    }
    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/',
      headers
    }

    {
      const res = await client.request(request)
      equal(requestsToOrigin, 1)
      strictEqual(await res.body.text(), 'hit 1: session=a')
    }

    headers.cookie[0] = 'session=b'

    {
      const res = await client.request(request)
      equal(requestsToOrigin, 2)
      strictEqual(await res.body.text(), 'hit 2: session=b')
    }

    headers.cookie = ['session=a']

    {
      const res = await client.request(request)
      equal(requestsToOrigin, 2)
      strictEqual(await res.body.text(), 'hit 1: session=a')
    }
  })

  test('comma-separated Vary values inside repeated header fields are honored', async () => {
    let requestsToOrigin = 0
    const server = createServer((req, res) => {
      requestsToOrigin++
      res.setHeader('cache-control', 'public, max-age=60')
      res.setHeader('vary', ['cookie, authorization', 'user-agent'])
      res.end(`hit ${requestsToOrigin}: ${req.headers.cookie}`)
    }).listen(0)

    await once(server, 'listening')

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    try {
      const request = cookie => ({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          cookie,
          'user-agent': 'cache-test'
        }
      })

      {
        const res = await client.request(request('session=a'))
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'hit 1: session=a')
      }

      {
        const res = await client.request(request('session=b'))
        equal(requestsToOrigin, 2)
        strictEqual(await res.body.text(), 'hit 2: session=b')
      }

      {
        const res = await client.request(request('session=a'))
        equal(requestsToOrigin, 2)
        strictEqual(await res.body.text(), 'hit 1: session=a')
      }
    } finally {
      await client.close()
      await new Promise(resolve => server.close(resolve))
    }
  })

  test('does not cache responses with wildcard Vary in repeated header fields', async () => {
    let requestsToOrigin = 0
    const server = createServer((_, res) => {
      requestsToOrigin++
      res.setHeader('cache-control', 'public, max-age=60')
      res.setHeader('vary', ['accept-encoding, *', 'user-agent'])
      res.end(`hit ${requestsToOrigin}`)
    }).listen(0)

    await once(server, 'listening')

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    try {
      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          'user-agent': 'cache-test'
        }
      }

      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'hit 1')
      }

      {
        const res = await client.request(request)
        equal(requestsToOrigin, 2)
        strictEqual(await res.body.text(), 'hit 2')
      }
    } finally {
      await client.close()
      await new Promise(resolve => server.close(resolve))
    }
  })

  test('does not cache responses with malformed Vary field names', async () => {
    let requestsToOrigin = 0
    const server = createServer((req, res) => {
      requestsToOrigin++
      res.setHeader('cache-control', 'public, max-age=60')
      res.setHeader('vary', 'cookie authorization')
      res.end(`hit ${requestsToOrigin}: ${req.headers.cookie}`)
    }).listen(0)

    await once(server, 'listening')

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    try {
      const request = cookie => ({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          cookie
        }
      })

      {
        const res = await client.request(request('session=a'))
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'hit 1: session=a')
      }

      {
        const res = await client.request(request('session=b'))
        equal(requestsToOrigin, 2)
        strictEqual(await res.body.text(), 'hit 2: session=b')
      }
    } finally {
      await client.close()
      await new Promise(resolve => server.close(resolve))
    }
  })

  test('revalidates reponses with no-cache directive, regardless of cacheByDefault', async () => {
    let requestCount = 0
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      ++requestCount
      res.setHeader('Vary', 'Accept-Encoding')
      res.setHeader('cache-control', 'no-cache')
      res.end(`Request count: ${requestCount}`)
    }).listen(0)

    after(async () => {
      server.close()

      await once(server, 'close')
    })

    await once(server, 'listening')

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache({
        cacheByDefault: 1000
      }))

    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    const res1 = await client.request(request)
    const body1 = await res1.body.text()
    strictEqual(body1, 'Request count: 1')
    strictEqual(requestCount, 1)

    const res2 = await client.request(request)
    const body2 = await res2.body.text()
    strictEqual(body2, 'Request count: 2')
    strictEqual(requestCount, 2)
  })

  test('stores response with no-cache directive and etag, revalidates it on reuse', async () => {
    let requestsToOrigin = 0
    let revalidationRequests = 0
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      if (req.headers['if-none-match'] === '"asd123"') {
        revalidationRequests++
        res.statusCode = 304
        res.end()
      } else {
        requestsToOrigin++
        res.setHeader('cache-control', 'no-cache')
        res.setHeader('etag', '"asd123"')
        res.end('asd')
      }
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    /**
     * @type {import('../../types/dispatcher').default.RequestOptions}
     */
    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    // Send initial request. This should reach the origin
    {
      const res = await client.request(request)
      strictEqual(await res.body.text(), 'asd')
      strictEqual(requestsToOrigin, 1)
      strictEqual(revalidationRequests, 0)
    }

    // Send second request. The response was stored, so this should be a
    //  revalidation request answered with a 304 and served from the cache
    {
      const res = await client.request(request)
      strictEqual(await res.body.text(), 'asd')
      strictEqual(requestsToOrigin, 1)
      strictEqual(revalidationRequests, 1)
    }
  })

  test('stores response with max-age=0 and etag, revalidates it on reuse', async () => {
    let requestsToOrigin = 0
    let revalidationRequests = 0
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      if (req.headers['if-none-match'] === '"asd123"') {
        revalidationRequests++
        res.statusCode = 304
        res.end()
      } else {
        requestsToOrigin++
        res.setHeader('cache-control', 'max-age=0')
        res.setHeader('etag', '"asd123"')
        res.end('asd')
      }
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    /**
     * @type {import('../../types/dispatcher').default.RequestOptions}
     */
    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    // Send initial request. This should reach the origin
    {
      const res = await client.request(request)
      strictEqual(await res.body.text(), 'asd')
      strictEqual(requestsToOrigin, 1)
      strictEqual(revalidationRequests, 0)
    }

    // Send second request. The response was stored but is already stale, so
    //  this should be a revalidation request answered with a 304 and served
    //  from the cache
    {
      const res = await client.request(request)
      strictEqual(await res.body.text(), 'asd')
      strictEqual(requestsToOrigin, 1)
      strictEqual(revalidationRequests, 1)
    }
  })

  test('stores response with no-cache directive, etag and last-modified, revalidates it on reuse', async () => {
    let requestsToOrigin = 0
    let revalidationRequests = 0
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      if (req.headers['if-none-match'] === '"asd123"') {
        revalidationRequests++
        res.statusCode = 304
        res.end()
      } else {
        requestsToOrigin++
        res.setHeader('cache-control', 'no-cache')
        res.setHeader('etag', '"asd123"')
        res.setHeader('last-modified', new Date(Date.now() - 60000).toUTCString())
        res.end('asd')
      }
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    /**
     * @type {import('../../types/dispatcher').default.RequestOptions}
     */
    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    // Send initial request. This should reach the origin
    {
      const res = await client.request(request)
      strictEqual(await res.body.text(), 'asd')
      strictEqual(requestsToOrigin, 1)
      strictEqual(revalidationRequests, 0)
    }

    // Send second request. The response was stored, so this should be a
    //  revalidation request answered with a 304 and served from the cache
    {
      const res = await client.request(request)
      strictEqual(await res.body.text(), 'asd')
      strictEqual(requestsToOrigin, 1)
      strictEqual(revalidationRequests, 1)
    }
  })

  test('expires caching', async () => {
    const clock = FakeTimers.install({
      toFake: ['Date']
    })

    let requestsToOrigin = 0
    let serverError
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      const now = new Date()
      now.setSeconds(now.getSeconds() + 1)
      res.setHeader('date', 0)
      res.setHeader('expires', now.toGMTString())
      requestsToOrigin++
      res.end('asd')
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
      clock.uninstall()
    })

    await once(server, 'listening')

    strictEqual(requestsToOrigin, 0)

    /**
     * @type {import('../../types/dispatcher').default.RequestOptions}
     */
    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    // Send initial request. This should reach the origin
    {
      const res = await client.request(request)
      if (serverError) {
        throw serverError
      }

      equal(requestsToOrigin, 1)
      strictEqual(await res.body.text(), 'asd')
    }

    // This is cached
    {
      const res = await client.request(request)
      if (serverError) {
        throw serverError
      }

      equal(requestsToOrigin, 1)
      strictEqual(await res.body.text(), 'asd')
    }

    clock.tick(1500)

    // Response is now stale, the origin should get a request
    {
      const res = await client.request(request)
      equal(requestsToOrigin, 2)
      strictEqual(await res.body.text(), 'asd')
    }

    // Response is now cached, the origin should not get a request
    {
      const res = await client.request(request)
      equal(requestsToOrigin, 2)
      strictEqual(await res.body.text(), 'asd')
    }
  })

  test('expires caching with Etag', async () => {
    const clock = FakeTimers.install({
      toFake: ['Date']
    })

    let requestsToOrigin = 0
    let serverError
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      const now = new Date()
      now.setSeconds(now.getSeconds() + 1)
      res.setHeader('date', 0)
      res.setHeader('expires', now.toGMTString())
      res.setHeader('etag', 'asd123')
      requestsToOrigin++
      res.end('asd')
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
      clock.uninstall()
    })

    await once(server, 'listening')

    strictEqual(requestsToOrigin, 0)

    /**
     * @type {import('../../types/dispatcher').default.RequestOptions}
     */
    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    // Send initial request. This should reach the origin
    {
      const res = await client.request(request)
      if (serverError) {
        throw serverError
      }

      equal(requestsToOrigin, 1)
      strictEqual(await res.body.text(), 'asd')
    }

    // This is cached
    {
      const res = await client.request(request)
      if (serverError) {
        throw serverError
      }

      equal(requestsToOrigin, 1)
      strictEqual(await res.body.text(), 'asd')
    }

    clock.tick(1500)

    // Response is now stale, the origin should get a request
    {
      const res = await client.request(request)
      equal(requestsToOrigin, 2)
      strictEqual(await res.body.text(), 'asd')
    }

    // Response is now cached, the origin should not get a request
    {
      const res = await client.request(request)
      equal(requestsToOrigin, 2)
      strictEqual(await res.body.text(), 'asd')
    }
  })

  test('max-age caching', async () => {
    const clock = FakeTimers.install({
      toFake: ['Date']
    })

    let requestsToOrigin = 0
    let serverError
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.setHeader('date', 0)
      res.setHeader('cache-control', 's-maxage=1')
      requestsToOrigin++
      res.end('asd')
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
      clock.uninstall()
    })

    await once(server, 'listening')

    strictEqual(requestsToOrigin, 0)

    /**
     * @type {import('../../types/dispatcher').default.RequestOptions}
     */
    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    // Send initial request. This should reach the origin
    {
      const res = await client.request(request)
      if (serverError) {
        throw serverError
      }

      equal(requestsToOrigin, 1)
      strictEqual(await res.body.text(), 'asd')
    }

    clock.tick(1500)

    // Response is now stale, the origin should get a request
    {
      const res = await client.request(request)
      equal(requestsToOrigin, 2)
      strictEqual(await res.body.text(), 'asd')
    }

    // Response is now cached, the origin should not get a request
    {
      const res = await client.request(request)
      equal(requestsToOrigin, 2)
      strictEqual(await res.body.text(), 'asd')
    }
  })

  test('vary headers are present in revalidation request', async () => {
    const clock = FakeTimers.install({
      toFake: ['Date']
    })

    let requestsToOrigin = 0
    let revalidationRequests = 0
    let serverError
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.setHeader('date', 0)
      res.setHeader('cache-control', 'max-age=1, stale-while-revalidate=10')

      try {
        const ifNoneMatch = req.headers['if-none-match']

        if (ifNoneMatch) {
          revalidationRequests++
          notEqual(req.headers.a, undefined)
          notEqual(req.headers['b-mixed-case'], undefined)

          res.statusCode = 304
          res.end()
        } else {
          requestsToOrigin++
          res.setHeader('vary', 'a, B-MIXED-CASe')
          res.setHeader('etag', '"asd"')
          res.end('asd')
        }
      } catch (err) {
        serverError = err
        res.end()
      }
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
      clock.uninstall()
    })

    await once(server, 'listening')

    strictEqual(requestsToOrigin, 0)
    strictEqual(revalidationRequests, 0)

    const request = {
      origin: 'localhost',
      path: '/',
      method: 'GET'
    }

    {
      const response = await client.request({
        ...request,
        headers: {
          a: 'asd',
          'b-Mixed-case': 'asd'
        }
      })
      if (serverError) {
        throw serverError
      }

      strictEqual(requestsToOrigin, 1)
      strictEqual(await response.body.text(), 'asd')
    }

    clock.tick(1500)

    {
      const response = await client.request({
        ...request,
        headers: {
          a: 'asd',
          'B-mixed-CASE': 'asd'
        }
      })
      if (serverError) {
        throw serverError
      }

      strictEqual(requestsToOrigin, 1)
      strictEqual(await response.body.text(), 'asd')
    }

    // Wait for background revalidation to complete
    await sleep(100)
    strictEqual(revalidationRequests, 1)
  })

  test('unsafe methods cause resource to be purged from cache', async () => {
    const server = createServer({ joinDuplicateHeaders: true }, (_, res) => res.end('asd')).listen(0)

    after(() => server.close())
    await once(server, 'listening')

    const store = new MemoryCacheStore()

    let deleteCalled = false
    const originalDelete = store.delete.bind(store)
    store.delete = (key) => {
      deleteCalled = true
      originalDelete(key)
    }

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache({
        store,
        methods: ['GET'] // explicitly only cache GET methods
      }))

    /**
     * @type {import('../../types/dispatcher').default.RequestOptions}
     */
    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    // Send initial request, will cache the response
    await client.request(request)

    // Sanity check
    equal(deleteCalled, false)

    // Make sure the common unsafe methods cause cache purges
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      deleteCalled = false

      await client.request({
        ...request,
        method
      })

      equal(deleteCalled, true, method)
    }
  })

  test('unsafe methods purge same-origin Location and Content-Location targets from cache', async () => {
    let locationTargetRequests = 0
    let contentLocationTargetRequests = 0
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      if (req.method === 'GET' && req.url === '/location-target') {
        locationTargetRequests++
        res.setHeader('cache-control', 'public, max-age=60')
        res.end(`location ${locationTargetRequests}`)
        return
      }

      if (req.method === 'GET' && req.url === '/content-location-target') {
        contentLocationTargetRequests++
        res.setHeader('cache-control', 'public, max-age=60')
        res.end(`content-location ${contentLocationTargetRequests}`)
        return
      }

      if (req.method === 'POST' && req.url === '/mutate') {
        res.statusCode = 204
        res.setHeader('location', '/location-target')
        res.setHeader('content-location', '/content-location-target')
        res.end()
        return
      }

      res.statusCode = 404
      res.end()
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const origin = `http://localhost:${server.address().port}`

    {
      const res = await client.request({ origin, method: 'GET', path: '/location-target' })
      strictEqual(await res.body.text(), 'location 1')
    }

    {
      const res = await client.request({ origin, method: 'GET', path: '/content-location-target' })
      strictEqual(await res.body.text(), 'content-location 1')
    }

    {
      const res = await client.request({ origin, method: 'POST', path: '/mutate' })
      strictEqual(res.statusCode, 204)
      await res.body.text()
    }

    {
      const res = await client.request({ origin, method: 'GET', path: '/location-target' })
      strictEqual(await res.body.text(), 'location 2')
    }

    {
      const res = await client.request({ origin, method: 'GET', path: '/content-location-target' })
      strictEqual(await res.body.text(), 'content-location 2')
    }
  })

  test('unsafe methods do not purge cross-origin Location and Content-Location targets from cache', async () => {
    let targetRequests = 0
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      if (req.method === 'GET' && req.url === '/target') {
        targetRequests++
        res.setHeader('cache-control', 'public, max-age=60')
        res.end(`target ${targetRequests}`)
        return
      }

      if (req.method === 'POST' && req.url === '/mutate') {
        res.statusCode = 204
        res.setHeader('location', 'http://example.com/target')
        res.setHeader('content-location', 'http://example.com/target')
        res.end()
        return
      }

      res.statusCode = 404
      res.end()
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const origin = `http://localhost:${server.address().port}`

    {
      const res = await client.request({ origin, method: 'GET', path: '/target' })
      strictEqual(await res.body.text(), 'target 1')
    }

    {
      const res = await client.request({ origin, method: 'POST', path: '/mutate' })
      strictEqual(res.statusCode, 204)
      await res.body.text()
    }

    {
      const res = await client.request({ origin, method: 'GET', path: '/target' })
      strictEqual(await res.body.text(), 'target 1')
    }
  })

  test('unsafe methods aren\'t cached', async () => {
    const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
      res.setHeader('cache-control', 'public, s-maxage=1')
      res.end('')
    }).listen(0)

    after(() => server.close())

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache({
        store: {
          get () {
            return undefined
          },
          createWriteStream (key) {
            fail(key.method)
          },
          delete () { }
        }
      }))

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      await client.request({
        origin: 'localhost',
        method,
        path: '/'
      })
    }
  })

  test('necessary headers are stripped', async () => {
    const headers = [
      // Headers defined in the spec that we need to strip
      'connection',
      'proxy-authenticate',
      'proxy-authentication-info',
      'proxy-authorization',
      'proxy-connection',
      'te',
      'upgrade',
      // Headers we need to specifiy to be stripped
      'should-be-stripped'
    ]

    let requestToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
      requestToOrigin++
      res.setHeader('cache-control', 's-maxage=10, no-cache=should-be-stripped')
      res.setHeader('should-not-be-stripped', 'asd')

      for (const header of headers) {
        res.setHeader(header, 'asd')
      }

      res.end()
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    /**
     * @type {import('../../types/dispatcher').default.RequestOptions}
     */
    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    {
      const res = await client.request(request)
      equal(requestToOrigin, 1)
      equal(res.headers['should-not-be-stripped'], 'asd')

      for (const header of headers) {
        equal(res.headers[header], 'asd')
      }
    }

    {
      const res = await client.request(request)
      equal(requestToOrigin, 1)
      equal(res.headers['should-not-be-stripped'], 'asd')
      equal(res.headers['transfer-encoding'], undefined)

      for (const header of headers) {
        equal(res.headers[header], undefined)
      }
    }
  })

  test('qualified no-cache/private with OWS around = strip named headers from cached responses', async () => {
    for (const cacheControl of [
      'public, max-age=60, no-cache= "set-cookie"',
      'public, max-age=60, no-cache ="set-cookie"',
      'public, max-age=60, no-cache \t= \t"set-cookie"',
      'public, max-age=60, no-cache="set-cookie"\t, immutable',
      'public, max-age=60, private= "set-cookie"',
      'public, max-age=60, private ="set-cookie"',
      'public, max-age=60, private\t=\t"set-cookie"',
      'public, max-age=60, private="set-cookie"\t, immutable'
    ]) {
      let requestToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestToOrigin++
        res.setHeader('cache-control', cacheControl)
        res.setHeader('set-cookie', 'session=secret')
        res.end('ok')
      }).listen(0)

      await once(server, 'listening')

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      try {
        const request = {
          origin: 'localhost',
          method: 'GET',
          path: '/'
        }

        {
          const res = await client.request(request)
          equal(requestToOrigin, 1, cacheControl)
          equal(res.headers['set-cookie'], 'session=secret', cacheControl)
          strictEqual(await res.body.text(), 'ok')
        }

        {
          const res = await client.request(request)
          equal(requestToOrigin, 1, cacheControl)
          equal(res.headers['set-cookie'], undefined, cacheControl)
          strictEqual(await res.body.text(), 'ok')
        }
      } finally {
        await client.close()
        await new Promise(resolve => server.close(resolve))
      }
    }
  })

  test('connection-nominated headers are stripped case-insensitively', async () => {
    let requestToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
      requestToOrigin++
      res.setHeader('cache-control', 's-maxage=10')
      res.setHeader('connection', ['Set-Cookie, X-Secret', 'Keep-Alive, X-Empty'])
      res.setHeader('set-cookie', 'session=secret')
      res.setHeader('x-secret', 'secret')
      res.setHeader('x-empty', '')
      res.end('ok')
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    {
      const res = await client.request(request)
      equal(requestToOrigin, 1)
      equal(res.headers['set-cookie'], 'session=secret')
      equal(res.headers['x-secret'], 'secret')
      equal(res.headers['x-empty'], '')
      strictEqual(await res.body.text(), 'ok')
    }

    {
      const res = await client.request(request)
      equal(requestToOrigin, 1)
      equal(res.headers['set-cookie'], undefined)
      equal(res.headers['x-secret'], undefined)
      equal(res.headers['x-empty'], undefined)
      strictEqual(await res.body.text(), 'ok')
    }
  })

  test('malformed quoted no-cache does not swallow a following no-store directive', async () => {
    for (const cacheControl of [
      'public, max-age=60, no-cache="set-cookie" garbage, no-store',
      'public, max-age=60, no-cache="set-cookie, no-store',
      'public, max-age=60, no-cache=',
      'public, max-age=60, no-store\u00a0',
      'public, max-age=60, no\u00a0-store'
    ]) {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.setHeader('cache-control', cacheControl)
        res.end(`hit ${requestsToOrigin}`)
      }).listen(0)

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      try {
        await once(server, 'listening')

        const request = {
          origin: 'localhost',
          method: 'GET',
          path: '/'
        }

        {
          const res = await client.request(request)
          equal(requestsToOrigin, 1, cacheControl)
          strictEqual(await res.body.text(), 'hit 1')
        }

        {
          const res = await client.request(request)
          equal(requestsToOrigin, 2, cacheControl)
          strictEqual(await res.body.text(), 'hit 2')
        }
      } finally {
        await client.close()
        await new Promise(resolve => server.close(resolve))
      }
    }
  })

  test('cacheByDefault', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
      requestsToOrigin++
      res.end('asd')
    }).listen(0)

    after(() => server.close())

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache({
        cacheByDefault: 3600
      }))

    equal(requestsToOrigin, 0)

    // Should hit the origin
    {
      const res = await client.request({
        origin: 'localhost',
        path: '/',
        method: 'GET'
      })
      equal(requestsToOrigin, 1)
      equal(await res.body.text(), 'asd')
    }

    // Should hit the cache
    {
      const res = await client.request({
        origin: 'localhost',
        path: '/',
        method: 'GET'
      })
      equal(requestsToOrigin, 1)
      equal(await res.body.text(), 'asd')
    }
  })

  test('malformed Last-Modified does not enable heuristic caching', async () => {
    for (const lastModified of ['0', '2025-01-01']) {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.setHeader('last-modified', lastModified)
        res.end(`hit ${requestsToOrigin}`)
      }).listen(0)

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      try {
        await once(server, 'listening')

        const request = {
          origin: 'localhost',
          method: 'GET',
          path: '/'
        }

        {
          const res = await client.request(request)
          equal(requestsToOrigin, 1, lastModified)
          equal(await res.body.text(), 'hit 1', lastModified)
        }

        {
          const res = await client.request(request)
          equal(requestsToOrigin, 2, lastModified)
          equal(await res.body.text(), 'hit 2', lastModified)
        }
      } finally {
        await client.close()
        await new Promise(resolve => server.close(resolve))
      }
    }
  })

  test('cacheByDefault does not make explicitly stale responses fresh', async () => {
    const clock = FakeTimers.install({
      now: new Date('2026-01-01T00:00:00.000Z'),
      toFake: ['Date']
    })

    try {
      for (const { name, headers } of [
        {
          name: 'max-age=0',
          headers: {
            'cache-control': 'public, max-age=0'
          }
        },
        {
          name: 's-maxage=0',
          headers: {
            'cache-control': 'public, s-maxage=0'
          }
        },
        {
          name: 'Expires in the past',
          headers: {
            expires: new Date(clock.now - 1000).toUTCString()
          }
        },
        {
          name: 'invalid Expires',
          headers: {
            expires: 'not a date'
          }
        },
        {
          name: 'invalid Expires day overflow',
          headers: {
            date: new Date(clock.now).toUTCString(),
            expires: 'Sun, 32 Jan 2026 00:00:00 GMT'
          }
        },
        {
          name: 'Age greater than Expires lifetime',
          headers: {
            date: new Date(clock.now).toUTCString(),
            expires: new Date(clock.now + 1000).toUTCString(),
            age: '2'
          }
        },
        {
          name: 'malformed Age',
          headers: {
            'cache-control': 'public, max-age=60',
            age: '0x60'
          }
        },
        {
          name: 'duplicate Age',
          headers: {
            'cache-control': 'public, max-age=60',
            age: ['0', '9999999999']
          }
        },
        {
          name: 'duplicate Date',
          headers: {
            'cache-control': 'public, max-age=60',
            date: [
              new Date(clock.now - 120000).toUTCString(),
              new Date(clock.now).toUTCString()
            ]
          }
        },
        {
          name: 'invalid max-age',
          headers: {
            'cache-control': 'public, max-age=bad'
          }
        },
        {
          name: 'invalid duplicate max-age',
          headers: {
            'cache-control': 'public, max-age=60, max-age=bad'
          }
        },
        {
          name: 'invalid max-age overrides Expires',
          headers: {
            'cache-control': 'public, max-age=bad',
            expires: new Date(clock.now + 60000).toUTCString()
          }
        },
        {
          name: 'invalid s-maxage',
          headers: {
            'cache-control': 'public, s-maxage=bad'
          }
        },
        {
          name: 'invalid s-maxage overrides max-age in shared cache',
          headers: {
            'cache-control': 'public, s-maxage=bad, max-age=60'
          }
        }
      ]) {
        let requestsToOrigin = 0
        const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
          requestsToOrigin++
          for (const [key, value] of Object.entries(headers)) {
            res.setHeader(key, value)
          }
          res.end(`hit ${requestsToOrigin}`)
        }).listen(0)

        await once(server, 'listening')

        const client = new Client(`http://localhost:${server.address().port}`)
          .compose(interceptors.cache({
            cacheByDefault: 3600
          }))

        try {
          const request = {
            origin: 'localhost',
            path: '/',
            method: 'GET'
          }

          {
            const res = await client.request(request)
            equal(requestsToOrigin, 1, name)
            equal(await res.body.text(), 'hit 1')
          }

          {
            const res = await client.request(request)
            equal(requestsToOrigin, 2, name)
            equal(await res.body.text(), 'hit 2')
          }
        } finally {
          await client.close()
          await new Promise(resolve => server.close(resolve))
        }
      }
    } finally {
      clock.uninstall()
    }
  })

  test('304 revalidation metadata that forbids reuse is not reused from cache', async () => {
    for (const testCase of [
      { name: 'no-store', headers: { 'cache-control': 'no-store' } },
      { name: 'private', headers: { 'cache-control': 'private' } },
      { name: 'vary-star', headers: { vary: '*' } },
      { name: 'malformed-vary', headers: { vary: 'cookie authorization' } }
    ]) {
      const clock = FakeTimers.install({
        toFake: ['Date']
      })

      let requestsToOrigin = 0
      let conditionalRequests = 0
      let unconditionalRefetches = 0
      const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
        requestsToOrigin++
        res.setHeader('date', new Date().toUTCString())

        if (req.headers['if-none-match'] || req.headers['if-modified-since']) {
          conditionalRequests++
          res.statusCode = 304
          for (const [headerName, headerValue] of Object.entries(testCase.headers)) {
            res.setHeader(headerName, headerValue)
          }
          res.end()
          return
        }

        if (requestsToOrigin === 1) {
          res.setHeader('cache-control', 'public, max-age=1')
          res.setHeader('etag', '"cached"')
          res.end('cached')
          return
        }

        unconditionalRefetches++
        res.setHeader('cache-control', 'public, max-age=60')
        res.setHeader('etag', '"refetched"')
        res.end('refetched')
      }).listen(0)

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      try {
        await once(server, 'listening')

        const request = {
          origin: 'localhost',
          method: 'GET',
          path: '/'
        }

        {
          const res = await client.request(request)
          equal(requestsToOrigin, 1, testCase.name)
          strictEqual(await res.body.text(), 'cached', testCase.name)
        }

        clock.tick(1500)

        {
          const res = await client.request(request)
          equal(conditionalRequests, 1, testCase.name)
          equal(unconditionalRefetches, 1, testCase.name)
          strictEqual(await res.body.text(), 'refetched', testCase.name)
        }
      } finally {
        await client.close()
        await new Promise(resolve => server.close(resolve))
        clock.uninstall()
      }
    }
  })

  test('304 synchronous revalidation Cache-Control metadata evicts stale-while-revalidate entry', async () => {
    const clock = FakeTimers.install({
      toFake: ['Date']
    })

    let requestsToOrigin = 0
    let conditionalRequests = 0
    let unconditionalRefetches = 0
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      requestsToOrigin++
      res.setHeader('date', new Date().toUTCString())

      if (req.headers['if-none-match'] || req.headers['if-modified-since']) {
        conditionalRequests++
        res.statusCode = 304
        res.setHeader('cache-control', 'public, no-cache')
        res.end()
        return
      }

      if (requestsToOrigin === 1) {
        res.setHeader('cache-control', 'public, max-age=1, stale-while-revalidate=10')
        res.setHeader('etag', '"cached"')
        res.end('cached')
        return
      }

      unconditionalRefetches++
      res.setHeader('cache-control', 'public, max-age=60')
      res.setHeader('etag', '"refetched"')
      res.end('refetched')
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
      clock.uninstall()
    })

    await once(server, 'listening')

    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    {
      const res = await client.request(request)
      equal(requestsToOrigin, 1)
      strictEqual(await res.body.text(), 'cached')
    }

    clock.tick(1500)

    {
      const res = await client.request({
        ...request,
        headers: {
          'cache-control': 'no-cache'
        }
      })
      equal(conditionalRequests, 1)
      strictEqual(await res.body.text(), 'cached')
    }

    {
      const res = await client.request(request)
      equal(unconditionalRefetches, 1)
      strictEqual(await res.body.text(), 'refetched')
    }
  })

  test('304 stale-while-revalidate metadata that forbids reuse evicts the cached response', async () => {
    for (const testCase of [
      { name: 'no-store', headers: { 'cache-control': 'no-store' } },
      { name: 'private', headers: { 'cache-control': 'private' } },
      { name: 'vary-star', headers: { vary: '*' } },
      { name: 'malformed-vary', headers: { vary: 'cookie authorization' } },
      { name: 'explicitly-stale', headers: { 'cache-control': 'public, max-age=0' } },
      { name: 'no-cache', headers: { 'cache-control': 'public, no-cache' } },
      { name: 'must-revalidate', headers: { 'cache-control': 'public, must-revalidate' } }
    ]) {
      const clock = FakeTimers.install({
        toFake: ['Date']
      })

      let requestsToOrigin = 0
      let conditionalRequests = 0
      let unconditionalRefetches = 0
      const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
        requestsToOrigin++
        res.setHeader('date', new Date().toUTCString())

        if (req.headers['if-none-match'] || req.headers['if-modified-since']) {
          conditionalRequests++
          res.statusCode = 304
          for (const [headerName, headerValue] of Object.entries(testCase.headers)) {
            res.setHeader(headerName, headerValue)
          }
          res.end()
          return
        }

        if (requestsToOrigin === 1) {
          res.setHeader('cache-control', 'public, max-age=1, stale-while-revalidate=10')
          res.setHeader('etag', '"cached"')
          res.end('cached')
          return
        }

        unconditionalRefetches++
        res.setHeader('cache-control', 'public, max-age=60')
        res.setHeader('etag', '"refetched"')
        res.end('refetched')
      }).listen(0)

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      try {
        await once(server, 'listening')

        const request = {
          origin: 'localhost',
          method: 'GET',
          path: '/'
        }

        {
          const res = await client.request(request)
          equal(requestsToOrigin, 1, testCase.name)
          strictEqual(await res.body.text(), 'cached', testCase.name)
        }

        clock.tick(1500)

        {
          const res = await client.request(request)
          equal(requestsToOrigin, 1, testCase.name)
          strictEqual(await res.body.text(), 'cached', testCase.name)
        }

        await sleep(100)
        equal(conditionalRequests, 1, testCase.name)

        {
          const res = await client.request(request)
          equal(unconditionalRefetches, 1, testCase.name)
          strictEqual(await res.body.text(), 'refetched', testCase.name)
        }
      } finally {
        await client.close()
        await new Promise(resolve => server.close(resolve))
        clock.uninstall()
      }
    }
  })

  test('stale-if-error (response)', async () => {
    const clock = FakeTimers.install({
      toFake: ['Date']
    })

    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
      res.setHeader('date', 0)

      requestsToOrigin++
      if (requestsToOrigin === 1) {
        // First request
        res.setHeader('cache-control', 'public, max-age=10, stale-if-error=20')
        res.end('asd')
      } else {
        res.statusCode = 500
        res.end('')
      }
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      clock.uninstall()
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    strictEqual(requestsToOrigin, 0)

    /**
     * @type {import('../../types/dispatcher').default.RequestOptions}
     */
    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    // Send first request. This will hit the origin and succeed
    {
      const response = await client.request(request)
      equal(requestsToOrigin, 1)
      equal(response.statusCode, 200)
      equal(await response.body.text(), 'asd')
    }

    // Send second request. It isn't stale yet, so this should be from the
    //  cache and succeed
    {
      const response = await client.request(request)
      equal(requestsToOrigin, 1)
      equal(response.statusCode, 200)
      equal(await response.body.text(), 'asd')
    }

    clock.tick(15000)

    // Send third request. This is now stale, the revalidation request should
    //  fail but the response should still be served from cache.
    {
      const response = await client.request(request)
      equal(requestsToOrigin, 2)
      equal(response.statusCode, 200)
      equal(await response.body.text(), 'asd')
    }

    clock.tick(25000)

    // Send fourth request. We're now outside the stale-if-error threshold and
    //  should see the error.
    {
      const response = await client.request(request)
      equal(requestsToOrigin, 3)
      equal(response.statusCode, 500)
    }
  })

  describe('Client-side directives', () => {
    test('max-age', async () => {
      const clock = FakeTimers.install({
        toFake: ['Date']
      })

      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.setHeader('date', 0)
        res.setHeader('cache-control', 'public, s-maxage=100')
        res.end()
      }).listen(0)

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      after(async () => {
        clock.uninstall()
        server.close()
        await client.close()
      })

      await once(server, 'listening')

      strictEqual(requestsToOrigin, 0)

      /**
       * @type {import('../../types/dispatcher').default.RequestOptions}
       */
      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      // Send first request to cache the response
      await client.request(request)
      equal(requestsToOrigin, 1)

      // Send second request with max-age=0, should force the request to reach
      //  the origin even immediately after insertion.
      await client.request({
        ...request,
        headers: {
          'cache-control': 'max-age=0'
        }
      })
      equal(requestsToOrigin, 2)

      // Send third request, should be served by the cache since it's within
      //  the window
      await client.request({
        ...request,
        headers: {
          'cache-control': 'max-age=5'
        }
      })
      equal(requestsToOrigin, 2)

      clock.tick(6000)

      // Send fourth request, should reach the origin
      await client.request({
        ...request,
        headers: {
          'cache-control': 'max-age=5'
        }
      })
      equal(requestsToOrigin, 3)
    })

    test('max-age=0 revalidates cached response conditionally', async () => {
      let requestsToOrigin = 0
      let revalidationRequests = 0
      const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
        requestsToOrigin++
        res.setHeader('cache-control', 'public, max-age=60')
        res.setHeader('etag', '"cached"')

        if (req.headers['if-none-match']) {
          revalidationRequests++
          equal(req.headers['cache-control'], 'max-age=0')
          res.statusCode = 304
          res.end()
          return
        }

        res.end(`hit ${requestsToOrigin}`)
      }).listen(0)

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      after(async () => {
        server.close()
        await client.close()
      })

      await once(server, 'listening')

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'hit 1')
      }

      {
        const res = await client.request({
          ...request,
          headers: {
            'cache-control': 'max-age=0'
          }
        })
        equal(requestsToOrigin, 2)
        equal(revalidationRequests, 1)
        strictEqual(await res.body.text(), 'hit 1')
      }
    })

    test('no-cache revalidation uses stored Last-Modified as If-Modified-Since', async () => {
      let requestsToOrigin = 0
      let revalidationRequests = 0
      const lastModified = 'Wed, 01 Jan 2020 00:00:00 GMT'
      const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
        requestsToOrigin++
        res.setHeader('date', new Date().toUTCString())
        res.setHeader('cache-control', 'public, max-age=60')
        res.setHeader('last-modified', lastModified)

        if (req.headers['if-modified-since']) {
          revalidationRequests++
          if (req.headers['if-modified-since'] === lastModified) {
            res.statusCode = 304
            res.end()
            return
          }
        }

        res.end(`hit ${requestsToOrigin}`)
      }).listen(0)

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      after(async () => {
        server.close()
        await client.close()
      })

      await once(server, 'listening')

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'hit 1')
      }

      {
        const res = await client.request({
          ...request,
          headers: {
            'cache-control': 'no-cache'
          }
        })
        equal(requestsToOrigin, 2)
        equal(revalidationRequests, 1)
        strictEqual(await res.body.text(), 'hit 1')
      }
    })

    test('max-age accounts for apparent response age from Date', async () => {
      const clock = FakeTimers.install({ now: 100000, toFake: ['Date'] })

      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.setHeader('date', new Date(clock.now - 30000).toUTCString())
        res.sendDate = false
        res.setHeader('cache-control', 'public, max-age=60')
        res.end(`hit ${requestsToOrigin}`)
      }).listen(0)

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      after(async () => {
        clock.uninstall()
        server.close()
        await client.close()
      })

      await once(server, 'listening')

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'hit 1')
      }

      {
        const res = await client.request({
          ...request,
          headers: {
            'cache-control': 'max-age=10'
          }
        })
        equal(requestsToOrigin, 2)
        strictEqual(await res.body.text(), 'hit 2')
      }
    })

    test('max-stale', async () => {
      const clock = FakeTimers.install({
        toFake: ['Date']
      })

      let requestsToOrigin = 0
      let revalidationRequests = 0
      const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
        res.setHeader('date', 0)
        res.setHeader('cache-control', 'public, max-age=1, stale-while-revalidate=10')

        if (req.headers['if-modified-since']) {
          revalidationRequests++
          res.statusCode = 304
          res.end()
        } else {
          requestsToOrigin++
          res.end('asd')
        }
      }).listen(0)

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      after(async () => {
        server.close()
        await client.close()
        clock.uninstall()
      })

      await once(server, 'listening')

      strictEqual(requestsToOrigin, 0)

      /**
       * @type {import('../../types/dispatcher').default.RequestOptions}
       */
      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      await client.request(request)
      equal(requestsToOrigin, 1)
      equal(revalidationRequests, 0)

      clock.tick(1500)

      // Send second request within the max-stale threshold
      await client.request({
        ...request,
        headers: {
          'cache-control': 'max-stale=5'
        }
      })
      equal(requestsToOrigin, 1)
      equal(revalidationRequests, 0)

      // Send third request outside the max-stale threshold
      await client.request({
        ...request,
        headers: {
          'cache-control': 'max-stale=0'
        }
      })
      equal(requestsToOrigin, 1)

      // Wait for background revalidation to complete
      await sleep(100)
      equal(revalidationRequests, 1)
    })

    test('max-stale does not override response revalidation requirements', async () => {
      const clock = FakeTimers.install({
        toFake: ['Date']
      })

      try {
        for (const directive of ['must-revalidate', 'proxy-revalidate', 's-maxage=1']) {
          let requestsToOrigin = 0
          let revalidationRequests = 0
          const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
            res.setHeader('date', 0)
            res.setHeader('cache-control', `public, max-age=1, ${directive}`)

            if (req.headers['if-modified-since']) {
              revalidationRequests++
              res.statusCode = 304
              res.end()
            } else {
              requestsToOrigin++
              res.end(`hit ${requestsToOrigin}`)
            }
          }).listen(0)

          await once(server, 'listening')

          const client = new Client(`http://localhost:${server.address().port}`)
            .compose(interceptors.cache())

          try {
            const request = {
              origin: 'localhost',
              method: 'GET',
              path: '/'
            }

            {
              const res = await client.request(request)
              equal(requestsToOrigin, 1, directive)
              equal(revalidationRequests, 0, directive)
              strictEqual(await res.body.text(), 'hit 1')
            }

            clock.tick(1500)

            {
              const res = await client.request({
                ...request,
                headers: {
                  'cache-control': 'max-stale=60'
                }
              })
              equal(requestsToOrigin, 1, directive)
              equal(revalidationRequests, 1, directive)
              strictEqual(await res.body.text(), 'hit 1')
            }
          } finally {
            await client.close()
            await new Promise(resolve => server.close(resolve))
          }
        }
      } finally {
        clock.uninstall()
      }
    })

    test('stale-while-revalidate does not override response revalidation requirements', async () => {
      const clock = FakeTimers.install({
        toFake: ['Date']
      })

      try {
        for (const directive of ['must-revalidate', 'proxy-revalidate', 's-maxage=1']) {
          let requestsToOrigin = 0
          const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
            requestsToOrigin++
            res.setHeader('date', 0)
            res.setHeader('cache-control', `public, max-age=1, stale-while-revalidate=60, ${directive}`)
            res.end(`hit ${requestsToOrigin}${req.headers['if-modified-since'] ? ' revalidated' : ''}`)
          }).listen(0)

          await once(server, 'listening')

          const client = new Client(`http://localhost:${server.address().port}`)
            .compose(interceptors.cache())

          try {
            const request = {
              origin: 'localhost',
              method: 'GET',
              path: '/'
            }

            {
              const res = await client.request(request)
              equal(requestsToOrigin, 1, directive)
              strictEqual(await res.body.text(), 'hit 1')
            }

            clock.tick(1500)

            {
              const res = await client.request(request)
              equal(requestsToOrigin, 2, directive)
              strictEqual(await res.body.text(), 'hit 2 revalidated')
            }
          } finally {
            await client.close()
            await new Promise(resolve => server.close(resolve))
          }
        }
      } finally {
        clock.uninstall()
      }
    })

    test('stale-if-error does not override response revalidation requirements', async () => {
      const clock = FakeTimers.install({
        toFake: ['Date']
      })

      try {
        for (const directive of ['must-revalidate', 'proxy-revalidate', 's-maxage=1']) {
          for (const staleIfErrorSource of ['response', 'request']) {
            let requestsToOrigin = 0
            const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
              requestsToOrigin++
              res.setHeader('date', 0)

              if (requestsToOrigin === 1) {
                res.setHeader('cache-control', `public, max-age=1, ${directive}${staleIfErrorSource === 'response' ? ', stale-if-error=60' : ''}`)
                res.end('cached')
              } else {
                res.statusCode = 500
                res.end('error')
              }
            }).listen(0)

            await once(server, 'listening')

            const client = new Client(`http://localhost:${server.address().port}`)
              .compose(interceptors.cache())

            try {
              const request = {
                origin: 'localhost',
                method: 'GET',
                path: '/'
              }

              {
                const res = await client.request(request)
                equal(requestsToOrigin, 1, `${directive} ${staleIfErrorSource}`)
                equal(res.statusCode, 200, `${directive} ${staleIfErrorSource}`)
                strictEqual(await res.body.text(), 'cached')
              }

              clock.tick(1500)

              {
                const res = await client.request({
                  ...request,
                  headers: staleIfErrorSource === 'request'
                    ? { 'cache-control': 'stale-if-error=60' }
                    : undefined
                })
                equal(requestsToOrigin, 2, `${directive} ${staleIfErrorSource}`)
                equal(res.statusCode, 500, `${directive} ${staleIfErrorSource}`)
                strictEqual(await res.body.text(), 'error')
              }
            } finally {
              await client.close()
              await new Promise(resolve => server.close(resolve))
            }
          }
        }
      } finally {
        clock.uninstall()
      }
    })

    test('min-fresh', async () => {
      const clock = FakeTimers.install({
        toFake: ['Date']
      })

      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.setHeader('date', 0)
        res.setHeader('cache-control', 'public, s-maxage=10')
        res.end()
      }).listen(0)

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      after(async () => {
        server.close()
        await client.close()
        clock.uninstall()
      })

      await once(server, 'listening')

      strictEqual(requestsToOrigin, 0)

      /**
       * @type {import('../../types/dispatcher').default.RequestOptions}
       */
      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      await client.request(request)
      equal(requestsToOrigin, 1)

      // Fast forward to response having 8sec ttl
      clock.tick(2000)

      // Send request within the threshold
      await client.request({
        ...request,
        headers: {
          'cache-control': 'min-fresh=5'
        }
      })
      equal(requestsToOrigin, 1)

      // Fast forward again, response has 2sec ttl
      clock.tick(6000)

      await client.request({
        ...request,
        headers: {
          'cache-control': 'min-fresh=5'
        }
      })
      equal(requestsToOrigin, 2)
    })

    test('no-cache', async () => {
      let requestsToOrigin = 0
      let revalidationRequests = 0
      const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
        if (req.headers['if-modified-since']) {
          revalidationRequests++
          res.statusCode = 304
          res.end()
        } else {
          requestsToOrigin++
          res.setHeader('cache-control', 'public, s-maxage=100')
          res.end('asd')
        }
      }).listen(0)

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      after(async () => {
        server.close()
        await client.close()
      })

      await once(server, 'listening')

      strictEqual(requestsToOrigin, 0)

      // Send initial request. This should reach the origin
      await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          'cache-control': 'no-cache'
        }
      })
      strictEqual(requestsToOrigin, 1)
      strictEqual(revalidationRequests, 0)

      // Send second request, a validation request should be sent
      await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          'cache-control': 'no-cache'
        }
      })
      strictEqual(requestsToOrigin, 1)
      strictEqual(revalidationRequests, 1)

      // Send third request w/o no-cache, this should be handled by the cache
      await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/'
      })
      strictEqual(requestsToOrigin, 1)
      strictEqual(revalidationRequests, 1)
    })

    test('Pragma no-cache revalidates when Cache-Control is absent', async () => {
      let requestsToOrigin = 0
      let revalidationRequests = 0
      const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
        if (req.headers['if-modified-since']) {
          revalidationRequests++
          res.statusCode = 304
          res.end()
        } else {
          requestsToOrigin++
          res.setHeader('cache-control', 'public, s-maxage=100')
          res.end('asd')
        }
      }).listen(0)

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      after(async () => {
        server.close()
        await client.close()
      })

      await once(server, 'listening')

      await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/'
      })
      strictEqual(requestsToOrigin, 1)
      strictEqual(revalidationRequests, 0)

      await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          pragma: 'other, no-cache'
        }
      })
      strictEqual(requestsToOrigin, 1)
      strictEqual(revalidationRequests, 1)
    })

    test('no-store', async () => {
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        res.setHeader('cache-control', 'public, s-maxage=100')
        res.end('asd')
      }).listen(0)

      const store = new MemoryCacheStore()
      store.createWriteStream = () => {
        fail('shouln\'t have reached this')
      }

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache({ store }))

      after(async () => {
        server.close()
        await client.close()
      })

      await once(server, 'listening')

      await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          'cache-control': 'no-store'
        }
      })
    })

    test('no-store in repeated request Cache-Control fields prevents storing', async () => {
      for (const { name, headers } of [
        {
          name: 'iterable',
          headers: [
            ['cache-control', 'no-store'],
            ['cache-control', 'max-age=60']
          ]
        },
        {
          name: 'plain object with different casing',
          headers: {
            'Cache-Control': 'no-store',
            'cache-control': 'max-age=60'
          }
        }
      ]) {
        let requestsToOrigin = 0
        const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
          requestsToOrigin++
          res.setHeader('cache-control', 'public, max-age=60')
          res.end(`hit ${requestsToOrigin}`)
        }).listen(0)

        const client = new Client(`http://localhost:${server.address().port}`)
          .compose(interceptors.cache())

        try {
          await once(server, 'listening')

          const request = {
            origin: 'localhost',
            method: 'GET',
            path: '/'
          }

          {
            const res = await client.request({
              ...request,
              headers
            })
            equal(requestsToOrigin, 1, name)
            strictEqual(await res.body.text(), 'hit 1', name)
          }

          {
            const res = await client.request(request)
            equal(requestsToOrigin, 2, name)
            strictEqual(await res.body.text(), 'hit 2', name)
          }
        } finally {
          await client.close()
          await new Promise(resolve => server.close(resolve))
        }
      }
    })

    test('only-if-cached', async () => {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        res.setHeader('cache-control', 'public, s-maxage=100')
        res.end('asd')
        requestsToOrigin++
      }).listen(0)

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      after(async () => {
        server.close()
        await client.close()
      })

      await once(server, 'listening')

      // Send initial request. This should reach the origin
      await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/'
      })
      equal(requestsToOrigin, 1)

      // Send second request, this shouldn't reach the origin
      await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          'cache-control': 'only-if-cached'
        }
      })
      equal(requestsToOrigin, 1)

      // Send third request to an uncached resource, this should return a 504
      {
        const res = await client.request({
          origin: 'localhost',
          method: 'GET',
          path: '/bla',
          headers: {
            'cache-control': 'only-if-cached'
          }
        })
        equal(res.statusCode, 504)
      }

      // Send fourth request to an uncached resource w/ a , this should return a 504
      {
        const res = await client.request({
          origin: 'localhost',
          method: 'GET',
          path: '/asd123',
          headers: {
            'cache-control': 'only-if-cached'
          }
        })
        equal(res.statusCode, 504)
      }
    })

    test('stale-if-error', async () => {
      const clock = FakeTimers.install({
        toFake: ['Date']
      })

      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        res.setHeader('date', 0)

        requestsToOrigin++
        if (requestsToOrigin === 1) {
          // First request, send stale-while-revalidate to keep the value in the cache
          res.setHeader('cache-control', 'public, max-age=10, stale-while-revalidate=20')
          res.end('asd')
        } else {
          res.statusCode = 500
          res.end('')
        }
      }).listen(0)

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      after(async () => {
        clock.uninstall()
        server.close()
        await client.close()
      })

      await once(server, 'listening')

      strictEqual(requestsToOrigin, 0)

      // Send first request. This will hit the origin and succeed
      {
        const response = await client.request({
          origin: 'localhost',
          path: '/',
          method: 'GET'
        })
        equal(requestsToOrigin, 1)
        equal(response.statusCode, 200)
        equal(await response.body.text(), 'asd')
      }

      // Send second request. It isn't stale yet, so this should be from the
      //  cache and succeed
      {
        const response = await client.request({
          origin: 'localhost',
          path: '/',
          method: 'GET'
        })
        equal(requestsToOrigin, 1)
        equal(response.statusCode, 200)
        equal(await response.body.text(), 'asd')
      }

      clock.tick(15000)

      // Send third request. This is now stale but within stale-while-revalidate,
      // should return stale immediately and trigger background revalidation
      {
        const response = await client.request({
          origin: 'localhost',
          path: '/',
          method: 'GET',
          headers: {
            'cache-control': 'stale-if-error=20'
          }
        })
        equal(response.statusCode, 200)
        equal(await response.body.text(), 'asd')
      }

      // Wait for background revalidation to complete (which will fail with 500)
      await sleep(100)
      equal(requestsToOrigin, 2)

      // Send a fourth request. Still within stale-while-revalidate but without stale-if-error,
      // should return stale since previous revalidation failed and stale-if-error applies
      {
        const response = await client.request({
          origin: 'localhost',
          path: '/',
          method: 'GET'
        })
        equal(response.statusCode, 200)
        equal(await response.body.text(), 'asd')
      }

      // Wait for another background revalidation
      await sleep(100)
      equal(requestsToOrigin, 3)

      clock.tick(25000)

      // Send fifth request. We're now outside the stale-if-error threshold and
      //  should see the error.
      {
        const response = await client.request({
          origin: 'localhost',
          path: '/',
          method: 'GET',
          headers: {
            'cache-control': 'stale-if-error=20'
          }
        })
        equal(requestsToOrigin, 4)
        equal(response.statusCode, 500)
      }
    })
  })

  // Partial list.
  const cacheableStatusCodes = [
    { code: 204, body: '' },
    { code: 302, body: 'Found' },
    { code: 307, body: 'Temporary Redirect' },
    { code: 404, body: 'Not Found' },
    { code: 410, body: 'Gone' }
  ]

  for (const { code, body } of cacheableStatusCodes) {
    test(`caches ${code} response with cache headers`, async () => {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.statusCode = code
        res.setHeader('cache-control', 'public, max-age=60')
        res.end(body)
      }).listen(0)

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      after(async () => {
        server.close()
        await client.close()
      })

      await once(server, 'listening')

      equal(requestsToOrigin, 0)

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      // First request should hit the origin
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        equal(res.statusCode, code)
        strictEqual(await res.body.text(), body)
      }

      // Second request should be served from cache
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1) // Should still be 1 (cached)
        equal(res.statusCode, code)
        strictEqual(await res.body.text(), body)
      }
    })
  }

  // Partial list.
  const nonHeuristicallyCacheableStatusCodes = [
    { code: 201, body: 'Created' },
    { code: 307, body: 'Temporary Redirect' },
    { code: 418, body: 'I am a teapot' }
  ]

  for (const { code, body } of nonHeuristicallyCacheableStatusCodes) {
    test(`does not cache non-heuristically cacheable status ${code} without explicit directive`, async () => {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.statusCode = code
        // By default the response may have a date and last-modified header set to 'now',
        // causing the cache to compute a 0 heuristic expiry, causing the test to not ascertain
        // it is really not cached.
        res.setHeader('date', '')
        res.end(body)
      }).listen(0)

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache({ cacheByDefault: 60 }))

      after(async () => {
        server.close()
        await client.close()
      })

      await once(server, 'listening')

      equal(requestsToOrigin, 0)

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      // First request should hit the origin
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        equal(res.statusCode, code)
        strictEqual(await res.body.text(), body)
      }

      // Second request should also hit the origin (not cached)
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 2) // Should be 2 (not cached)
        equal(res.statusCode, code)
        strictEqual(await res.body.text(), body)
      }
    })
  }

  test('discriminates caching of range requests, or does not cache them', async () => {
    let requestsToOrigin = 0
    const body = 'Fake range request response'
    const code = 206
    const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
      requestsToOrigin++
      res.statusCode = code
      res.setHeader('cache-control', 'public, max-age=60')
      res.end(body)
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    equal(requestsToOrigin, 0)

    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/',
      headers: {
        range: 'bytes=10-'
      }
    }

    // First request should hit the origin
    {
      const res = await client.request(request)
      equal(requestsToOrigin, 1)
      equal(res.statusCode, code)
      strictEqual(await res.body.text(), body)
    }

    // Second request with different range should hit the origin too
    request.headers.range = 'bytes=5-'
    {
      const res = await client.request(request)
      equal(requestsToOrigin, 2)
      equal(res.statusCode, code)
      strictEqual(await res.body.text(), body)
    }
  })

  test('discriminates caching of conditional requests (if-none-match), or does not cache them', async () => {
    let requestsToOrigin = 0
    const body = ''
    const code = 304
    const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
      requestsToOrigin++
      res.statusCode = code
      res.setHeader('cache-control', 'public, max-age=60')
      res.end(body)
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    equal(requestsToOrigin, 0)

    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/',
      headers: {
        'if-none-match': 'some-etag'
      }
    }

    // First request should hit the origin
    {
      const res = await client.request(request)
      equal(requestsToOrigin, 1)
      equal(res.statusCode, code)
      strictEqual(await res.body.text(), body)
    }

    // Second request with different etag should hit the origin too
    request.headers['if-none-match'] = 'another-etag'
    {
      const res = await client.request(request)
      equal(requestsToOrigin, 2)
      equal(res.statusCode, code)
      strictEqual(await res.body.text(), body)
    }
  })

  test('discriminates caching of conditional requests (if-modified-since), or does not cache them', async () => {
    let requestsToOrigin = 0
    const body = ''
    const code = 304
    const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
      requestsToOrigin++
      res.statusCode = code
      res.setHeader('cache-control', 'public, max-age=60')
      res.end(body)
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    equal(requestsToOrigin, 0)

    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/',
      headers: {
        'if-modified-since': new Date().toUTCString()
      }
    }

    // First request should hit the origin
    {
      const res = await client.request(request)
      equal(requestsToOrigin, 1)
      equal(res.statusCode, code)
      strictEqual(await res.body.text(), body)
    }

    // Second request with different since should hit the origin too
    request.headers['if-modified-since'] = new Date(0).toUTCString()
    {
      const res = await client.request(request)
      equal(requestsToOrigin, 2)
      equal(res.statusCode, code)
      strictEqual(await res.body.text(), body)
    }
  })

  test('stale-while-revalidate returns stale immediately and revalidates in background (RFC 5861)', async () => {
    let requestsToOrigin = 0
    let revalidationRequests = 0
    let serverResponse = 'original-response'

    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      const responseDate = new Date()
      res.setHeader('date', responseDate.toUTCString())
      res.setHeader('cache-control', 'max-age=1, stale-while-revalidate=10')

      if (req.headers['if-modified-since']) {
        revalidationRequests++
        // Return updated content on revalidation
        serverResponse = 'revalidated-response'
        res.end(serverResponse)
      } else {
        requestsToOrigin++
        res.end(serverResponse)
      }
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    // Send initial request to cache the response
    {
      const res = await client.request(request)
      equal(requestsToOrigin, 1)
      strictEqual(await res.body.text(), 'original-response')
    }

    // Wait for response to become stale
    await sleep(1100)

    // Request stale content - should return immediately with stale content
    const startTime = Date.now()
    {
      const res = await client.request(request)
      const responseTime = Date.now() - startTime

      // Should return stale content immediately (< 50ms)
      equal(res.statusCode, 200)
      strictEqual(await res.body.text(), 'original-response')
      equal(requestsToOrigin, 1) // No additional origin requests yet

      // Response should be immediate (RFC 5861 requirement)
      if (responseTime > 100) {
        fail(`stale-while-revalidate response took ${responseTime}ms, should be < 100ms`)
      }
    }

    // Wait for background revalidation to complete
    await sleep(500)

    // Verify that revalidation occurred in background
    equal(revalidationRequests, 1, 'Background revalidation should have occurred')
  })

  test('stale-while-revalidate updates cache after background revalidation (receiving new data)', async () => {
    let requestsToOrigin = 0
    let revalidationRequests = 0

    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      const responseDate = new Date()
      res.setHeader('date', responseDate.toUTCString())
      res.setHeader('cache-control', 'max-age=1, stale-while-revalidate=10')

      if (req.headers['if-modified-since']) {
        revalidationRequests++
        // Return updated content
        res.end('updated-response')
      } else {
        requestsToOrigin++
        res.end('original-response')
      }
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    // Initial request
    {
      const res = await client.request(request)
      equal(requestsToOrigin, 1)
      strictEqual(await res.body.text(), 'original-response')
    }

    // Wait for staleness
    await sleep(1100)

    // First stale request - gets stale content immediately
    {
      const res = await client.request(request)
      strictEqual(await res.body.text(), 'original-response')
    }

    // Wait for background revalidation
    await sleep(500)
    equal(revalidationRequests, 1)

    // Second stale request - should get updated content from cache
    // (still within stale-while-revalidate window)
    {
      const res = await client.request(request)
      strictEqual(await res.body.text(), 'updated-response')
      equal(requestsToOrigin, 1) // Still only one origin request
    }
  })

  describe('origins option', () => {
    test('caches request when origin matches string in whitelist', async () => {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.setHeader('cache-control', 's-maxage=10')
        res.end('cached')
      }).listen(0)

      after(() => server.close())
      await once(server, 'listening')

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache({
          origins: ['localhost']
        }))

      after(() => client.close())

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      // First request should hit origin
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'cached')
      }

      // Second request should be served from cache
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'cached')
      }
    })

    test('skips caching when origin does not match string in whitelist', async () => {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.setHeader('cache-control', 's-maxage=10')
        res.end('not cached')
      }).listen(0)

      after(() => server.close())
      await once(server, 'listening')

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache({
          origins: ['http://example.com']
        }))

      after(() => client.close())

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      // First request should hit origin
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'not cached')
      }

      // Second request should also hit origin (not cached)
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 2)
        strictEqual(await res.body.text(), 'not cached')
      }
    })

    test('caches request when origin matches RegExp in whitelist', async () => {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.setHeader('cache-control', 's-maxage=10')
        res.end('cached')
      }).listen(0)

      after(() => server.close())
      await once(server, 'listening')

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache({
          origins: [/localhost/]
        }))

      after(() => client.close())

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      // First request should hit origin
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'cached')
      }

      // Second request should be served from cache
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'cached')
      }
    })

    test('skips caching when origin does not match RegExp in whitelist', async () => {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.setHeader('cache-control', 's-maxage=10')
        res.end('not cached')
      }).listen(0)

      after(() => server.close())
      await once(server, 'listening')

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache({
          origins: [/example\.com/]
        }))

      after(() => client.close())

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      // First request should hit origin
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'not cached')
      }

      // Second request should also hit origin (not cached)
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 2)
        strictEqual(await res.body.text(), 'not cached')
      }
    })

    test('caches request when origin matches any entry in mixed array', async () => {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.setHeader('cache-control', 's-maxage=10')
        res.end('cached')
      }).listen(0)

      after(() => server.close())
      await once(server, 'listening')

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache({
          origins: ['http://other.com', /localhost/]
        }))

      after(() => client.close())

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      // First request should hit origin
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'cached')
      }

      // Second request should be served from cache (matches RegExp)
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'cached')
      }
    })

    test('caches all origins when origins option is undefined (default behavior)', async () => {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.setHeader('cache-control', 's-maxage=10')
        res.end('cached')
      }).listen(0)

      after(() => server.close())
      await once(server, 'listening')

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      after(() => client.close())

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      // First request should hit origin
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'cached')
      }

      // Second request should be served from cache
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'cached')
      }
    })

    test('caches nothing when origins is empty array', async () => {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.setHeader('cache-control', 's-maxage=10')
        res.end('not cached')
      }).listen(0)

      after(() => server.close())
      await once(server, 'listening')

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache({
          origins: []
        }))

      after(() => client.close())

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      // First request should hit origin
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'not cached')
      }

      // Second request should also hit origin (not cached)
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 2)
        strictEqual(await res.body.text(), 'not cached')
      }
    })

    test('throws TypeError when origins is not an array', async () => {
      const { throws } = require('node:assert')

      throws(
        () => interceptors.cache({ origins: 'http://example.com' }),
        {
          name: 'TypeError',
          message: /expected opts\.origins to be an array or undefined/i
        }
      )
    })

    test('throws TypeError when origins array contains invalid type', async () => {
      const { throws } = require('node:assert')

      throws(
        () => interceptors.cache({ origins: [123] }),
        {
          name: 'TypeError',
          message: /expected opts\.origins\[0\] to be a string or RegExp/i
        }
      )
    })

    test('string matching is case insensitive', async () => {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.setHeader('cache-control', 's-maxage=10')
        res.end('cached')
      }).listen(0)

      after(() => server.close())
      await once(server, 'listening')

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache({
          origins: ['LOCALHOST']
        }))

      after(() => client.close())

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      // First request should hit origin
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'cached')
      }

      // Second request should be served from cache (case insensitive match)
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'cached')
      }
    })

    test('different hosts are treated as different origins', async () => {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.setHeader('cache-control', 's-maxage=10')
        res.end('not cached')
      }).listen(0)

      after(() => server.close())
      await once(server, 'listening')

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache({
          origins: ['example.com']
        }))

      after(() => client.close())

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      // First request should hit origin
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'not cached')
      }

      // Second request should also hit origin (different host = different origin)
      {
        const res = await client.request(request)
        equal(requestsToOrigin, 2)
        strictEqual(await res.body.text(), 'not cached')
      }
    })
  })

  describe('determineDeleteAt', () => {
    test('max-age response has deleteAt proportional to freshness lifetime, not 1 year', async () => {
      const clock = FakeTimers.install({ now: 1000, toFake: ['Date'] })
      after(() => clock.uninstall())

      const store = new MemoryCacheStore()
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        res.setHeader('cache-control', 'public, max-age=60')
        res.setHeader('date', new Date(clock.now).toUTCString())
        res.sendDate = false
        res.end('short-lived')
      }).listen(0)

      after(async () => {
        server.close()
        await client.close()
      })

      await once(server, 'listening')

      const origin = `http://localhost:${server.address().port}`
      const client = new Client(origin)
        .compose(interceptors.cache({ store }))

      const res = await client.request({ origin, method: 'GET', path: '/delete-at-maxage' })
      strictEqual(await res.body.text(), 'short-lived')

      const cached = store.get(makeCacheKey({ origin, method: 'GET', path: '/delete-at-maxage', headers: {} }))

      notEqual(cached, undefined)
      // deleteAt should be approximately 2x max-age (staleAt + freshnessLifetime),
      // not 1 year out
      const maxExpected = clock.now + (60 * 1000 * 3) // generous upper bound
      equal(cached.deleteAt < maxExpected, true, `deleteAt (${cached.deleteAt}) should be well under 3x max-age (${maxExpected})`)
      equal(cached.deleteAt > cached.staleAt, true, 'deleteAt should be greater than staleAt to allow revalidation')
    })

    test('sqlite store keeps short-lived entries past Date header precision loss so they can revalidate', { skip: runtimeFeatures.has('sqlite') === false }, async () => {
      const clock = FakeTimers.install({ now: 1000, toFake: ['Date'] })
      const store = new SqliteCacheStore()
      let requestsToOrigin = 0
      let revalidationHeaders

      const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
        requestsToOrigin++

        if (requestsToOrigin === 2) {
          revalidationHeaders = req.headers

          if (req.headers['if-none-match'] !== '"abcd"' || typeof req.headers['if-modified-since'] !== 'string') {
            res.statusCode = 412
            res.end('expected conditional revalidation')
            return
          }

          res.statusCode = 304
          res.end()
          return
        }

        res.setHeader('cache-control', 'max-age=2, must-revalidate')
        // Deliberately round the response date down to the previous second.
        res.setHeader('date', new Date(0).toUTCString())
        res.setHeader('etag', '"abcd"')
        res.sendDate = false
        res.end('short-lived')
      }).listen(0)

      after(async () => {
        server.close()
        store.close()
        await client.close()
        clock.uninstall()
      })

      await once(server, 'listening')

      const origin = `http://localhost:${server.address().port}`
      const client = new Client(origin)
        .compose(interceptors.cache({ store, type: 'private' }))

      const request = {
        origin,
        method: 'GET',
        path: '/date-header-precision'
      }

      {
        const res = await client.request(request)
        strictEqual(await res.body.text(), 'short-lived')
        equal(requestsToOrigin, 1)
      }

      {
        const res = await client.request(request)
        strictEqual(await res.body.text(), 'short-lived')
        equal(requestsToOrigin, 1)
      }

      clock.tick(3001)

      const cached = store.get(makeCacheKey({ ...request, headers: {} }))
      notEqual(cached, undefined, 'entry should remain available long enough to be revalidated')

      {
        const res = await client.request(request)
        strictEqual(await res.body.text(), 'short-lived')
        equal(requestsToOrigin, 2)
        strictEqual(revalidationHeaders['if-none-match'], '"abcd"')
        strictEqual(typeof revalidationHeaders['if-modified-since'], 'string')
      }
    })

    test('future Date header does not extend max-age freshness', async () => {
      const clock = FakeTimers.install({ now: 1000, toFake: ['Date'] })
      after(() => clock.uninstall())

      const store = new MemoryCacheStore()
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        res.setHeader('cache-control', 'public, max-age=60')
        res.setHeader('date', new Date(clock.now + 86400000).toUTCString())
        res.sendDate = false
        res.end('future-date')
      }).listen(0)

      after(async () => {
        server.close()
        await client.close()
      })

      await once(server, 'listening')

      const origin = `http://localhost:${server.address().port}`
      const client = new Client(origin)
        .compose(interceptors.cache({ store }))

      const res = await client.request({ origin, method: 'GET', path: '/future-date' })
      strictEqual(await res.body.text(), 'future-date')

      const cached = store.get(makeCacheKey({ origin, method: 'GET', path: '/future-date', headers: {} }))

      notEqual(cached, undefined)
      equal(cached.staleAt <= clock.now + 60000, true, `staleAt (${cached.staleAt}) should not be extended by a future Date header`)
      equal(cached.staleAt > clock.now, true, 'entry should still be freshly cacheable for max-age')
    })

    test('future Date header does not extend Expires freshness', async () => {
      const clock = FakeTimers.install({ now: 1000, toFake: ['Date'] })
      after(() => clock.uninstall())

      const store = new MemoryCacheStore()
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        const responseDate = clock.now + 86400000
        res.setHeader('date', new Date(responseDate).toUTCString())
        res.setHeader('expires', new Date(responseDate + 60000).toUTCString())
        res.sendDate = false
        res.end('future-expires')
      }).listen(0)

      after(async () => {
        server.close()
        await client.close()
      })

      await once(server, 'listening')

      const origin = `http://localhost:${server.address().port}`
      const client = new Client(origin)
        .compose(interceptors.cache({ store }))

      const res = await client.request({ origin, method: 'GET', path: '/future-expires' })
      strictEqual(await res.body.text(), 'future-expires')

      const cached = store.get(makeCacheKey({ origin, method: 'GET', path: '/future-expires', headers: {} }))

      notEqual(cached, undefined)
      equal(cached.staleAt <= clock.now + 60000, true, `staleAt (${cached.staleAt}) should not be extended by a future Date header`)
      equal(cached.staleAt > clock.now, true, 'entry should still be freshly cacheable until Expires')
    })

    test('Age header reduces remaining max-age freshness', async () => {
      const clock = FakeTimers.install({ now: 100000, toFake: ['Date'] })
      after(() => clock.uninstall())

      const store = new MemoryCacheStore()
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        res.setHeader('cache-control', 'public, max-age=60')
        res.setHeader('age', '30')
        res.setHeader('date', new Date(clock.now).toUTCString())
        res.sendDate = false
        res.end('aged')
      }).listen(0)

      after(async () => {
        server.close()
        await client.close()
      })

      await once(server, 'listening')

      const origin = `http://localhost:${server.address().port}`
      const client = new Client(origin)
        .compose(interceptors.cache({ store }))

      const res = await client.request({ origin, method: 'GET', path: '/aged' })
      strictEqual(await res.body.text(), 'aged')

      const cached = store.get(makeCacheKey({ origin, method: 'GET', path: '/aged', headers: {} }))

      notEqual(cached, undefined)
      equal(cached.staleAt <= clock.now + 30000, true, `staleAt (${cached.staleAt}) should account for Age`)
      equal(cached.staleAt > clock.now, true, 'entry should remain fresh for the unexpired max-age remainder')
    })

    test('immutable response has deleteAt of ~1 year', async () => {
      const clock = FakeTimers.install({ now: 1000, toFake: ['Date'] })
      after(() => clock.uninstall())

      const store = new MemoryCacheStore()
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        res.setHeader('cache-control', 'public, immutable')
        res.setHeader('date', new Date(clock.now).toUTCString())
        res.sendDate = false
        res.end('immutable-content')
      }).listen(0)

      after(async () => {
        server.close()
        await client.close()
      })

      await once(server, 'listening')

      const origin = `http://localhost:${server.address().port}`
      const client = new Client(origin)
        .compose(interceptors.cache({ store }))

      const res = await client.request({ origin, method: 'GET', path: '/delete-at-immutable' })
      strictEqual(await res.body.text(), 'immutable-content')

      const cached = store.get(makeCacheKey({ origin, method: 'GET', path: '/delete-at-immutable', headers: {} }))

      notEqual(cached, undefined)
      const oneYear = 31536000000
      // deleteAt should be approximately 1 year out
      equal(cached.deleteAt >= clock.now + oneYear - 1000, true, `deleteAt (${cached.deleteAt}) should be ~1 year out`)
      // staleAt should also be approximately 1 year out (not ~8.7 hours)
      equal(cached.staleAt >= clock.now + oneYear - 1000, true, `staleAt (${cached.staleAt}) should be ~1 year out`)
    })

    test('stale-while-revalidate extends deleteAt beyond staleAt', async () => {
      const clock = FakeTimers.install({ now: 1000, toFake: ['Date'] })
      after(() => clock.uninstall())

      const store = new MemoryCacheStore()
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        res.setHeader('cache-control', 'public, max-age=60, stale-while-revalidate=300')
        res.setHeader('date', new Date(clock.now).toUTCString())
        res.sendDate = false
        res.end('swr-content')
      }).listen(0)

      after(async () => {
        server.close()
        await client.close()
      })

      await once(server, 'listening')

      const origin = `http://localhost:${server.address().port}`
      const client = new Client(origin)
        .compose(interceptors.cache({ store }))

      const res = await client.request({ origin, method: 'GET', path: '/delete-at-swr' })
      strictEqual(await res.body.text(), 'swr-content')

      const cached = store.get(makeCacheKey({ origin, method: 'GET', path: '/delete-at-swr', headers: {} }))

      notEqual(cached, undefined)
      // deleteAt should be staleAt + stale-while-revalidate (300s)
      const expectedDeleteAt = cached.staleAt + (300 * 1000)
      equal(cached.deleteAt, expectedDeleteAt, `deleteAt (${cached.deleteAt}) should be staleAt + 300s (${expectedDeleteAt})`)
    })
  })

  // https://www.rfc-editor.org/rfc/rfc9111.html#name-storing-responses-to-authen
  describe('RFC 9111 §3.5 - Storing Responses to Authenticated Requests', () => {
    test('caches response when request has Authorization and response has public directive', async () => {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.setHeader('cache-control', 'public, max-age=60')
        res.end('authenticated')
      }).listen(0)

      after(() => server.close())
      await once(server, 'listening')

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      after(() => client.close())

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          authorization: 'Bearer token123'
        }
      }

      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'authenticated')
      }

      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'authenticated')
      }
    })

    test('caches response when request has Authorization and response has s-maxage directive', async () => {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.setHeader('cache-control', 's-maxage=60')
        res.end('authenticated')
      }).listen(0)

      after(() => server.close())
      await once(server, 'listening')

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      after(() => client.close())

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          authorization: 'Bearer token123'
        }
      }

      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'authenticated')
      }

      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'authenticated')
      }
    })

    test('caches response when request has Authorization and response has must-revalidate directive', async () => {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.setHeader('cache-control', 'must-revalidate, max-age=60')
        res.end('authenticated')
      }).listen(0)

      after(() => server.close())
      await once(server, 'listening')

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      after(() => client.close())

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          authorization: 'Bearer token123'
        }
      }

      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'authenticated')
      }

      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'authenticated')
      }
    })

    test('does not cache response when request has Authorization and qualified no-cache/private names Authorization with OWS', async () => {
      for (const cacheControl of [
        'public, max-age=60, private=" authorization"',
        'public, max-age=60, no-cache="\tauthorization"',
        'public, max-age=60, no-cache=authorization\t',
        'public, max-age=60, private= "authorization"',
        'public, max-age=60, private ="authorization"',
        'public, max-age=60, private\t=\t"authorization"',
        'public, max-age=60, private="authorization"\t, immutable',
        'public, max-age=60, private="authorization" garbage',
        'public, max-age=60, private=, private="authorization"',
        'public, max-age=60, no-cache= "authorization"',
        'public, max-age=60, no-cache ="authorization"',
        'public, max-age=60, no-cache \t= \t"authorization"',
        'public, max-age=60, no-cache= "\tauthorization\t"\t',
        'public, max-age=60, no-cache="authorization" garbage',
        'public, max-age=60, no-cache="set-cookie" garbage, no-cache="authorization"',
        'public, max-age=60, no-cache=, no-cache="authorization"'
      ]) {
        let requestsToOrigin = 0
        const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
          requestsToOrigin++
          res.setHeader('cache-control', cacheControl)
          res.end(`authenticated ${requestsToOrigin}`)
        }).listen(0)

        await once(server, 'listening')

        const client = new Client(`http://localhost:${server.address().port}`)
          .compose(interceptors.cache())

        try {
          const request = {
            origin: 'localhost',
            method: 'GET',
            path: '/',
            headers: {
              authorization: 'Bearer token123'
            }
          }

          {
            const res = await client.request(request)
            equal(requestsToOrigin, 1)
            strictEqual(await res.body.text(), 'authenticated 1')
          }

          {
            const res = await client.request({
              origin: 'localhost',
              method: 'GET',
              path: '/'
            })
            equal(requestsToOrigin, 2)
            strictEqual(await res.body.text(), 'authenticated 2')
          }
        } finally {
          await client.close()
          await new Promise(resolve => server.close(resolve))
        }
      }
    })

    test('does not cache response when request has Authorization and only invalid permissive directives', async () => {
      for (const cacheControl of [
        'public =, max-age=60',
        'public= , max-age=60',
        'must-revalidate =, max-age=60',
        'public\u00a0, max-age=60',
        'must-revalidate\u00a0, max-age=60',
        'public=bad, public, max-age=60',
        'must-revalidate=bad, must-revalidate, max-age=60',
        'extension="x, public, s-maxage=60, y", max-age=60',
        'extension="x, public, s-maxage=60, max-age=60',
        ['extension="x', 'public, s-maxage=60, max-age=60'],
        'public, max-age=60, extension="x, private',
        's-maxage =60',
        's-maxage= 60',
        's-maxage=60x',
        's-maxage=bad, s-maxage=60',
        's-maxage=60, s-maxage=bad',
        's-maxage =60, s-maxage=60',
        'no-store=false, public, max-age=60',
        'public, max-age=60, max-age=0',
        's-maxage=60, s-maxage=0',
        'public, max-age=60, private\u00a0',
        'public, max-age=60, priv\u00a0ate'
      ]) {
        let requestsToOrigin = 0
        const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
          requestsToOrigin++
          res.setHeader('cache-control', cacheControl)
          res.end(`authenticated ${requestsToOrigin}`)
        }).listen(0)

        await once(server, 'listening')

        const client = new Client(`http://localhost:${server.address().port}`)
          .compose(interceptors.cache())

        try {
          const request = {
            origin: 'localhost',
            method: 'GET',
            path: '/',
            headers: {
              authorization: 'Bearer token123'
            }
          }

          {
            const res = await client.request(request)
            equal(requestsToOrigin, 1, cacheControl)
            strictEqual(await res.body.text(), 'authenticated 1')
          }

          {
            const res = await client.request(request)
            equal(requestsToOrigin, 2, cacheControl)
            strictEqual(await res.body.text(), 'authenticated 2')
          }
        } finally {
          await client.close()
          await new Promise(resolve => server.close(resolve))
        }
      }
    })

    test('does not cache Authorization response with malformed s-maxage in shared cache', async () => {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
        requestsToOrigin++
        res.setHeader('cache-control', 's-maxage=60x')

        if (req.headers.authorization === 'Bearer tenant-a-token') {
          res.end('SECRET_FOR_AUTHENTICATED_REQUEST')
          return
        }

        res.end('PUBLIC_RESPONSE')
      }).listen(0)

      after(() => server.close())
      await once(server, 'listening')

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache({ type: 'shared' }))

      after(() => client.close())

      {
        const res = await client.request({
          origin: 'localhost',
          method: 'GET',
          path: '/',
          headers: {
            authorization: 'Bearer tenant-a-token'
          }
        })
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'SECRET_FOR_AUTHENTICATED_REQUEST')
      }

      {
        const res = await client.request({
          origin: 'localhost',
          method: 'GET',
          path: '/'
        })
        equal(requestsToOrigin, 2)
        strictEqual(await res.body.text(), 'PUBLIC_RESPONSE')
      }
    })

    test('does not cache shared response with empty qualified private directive', async () => {
      for (const cacheControl of [
        'public, max-age=60, private=""',
        'public, max-age=60, private=","',
        'public, max-age=60, private="   "'
      ]) {
        let requestsToOrigin = 0
        const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
          requestsToOrigin++
          const who = req.headers.authorization || '(no-auth)'
          res.setHeader('cache-control', cacheControl)
          res.setHeader('set-cookie', `session=secret-for-${who}`)
          res.end(`authenticated ${who} ${requestsToOrigin}`)
        }).listen(0)

        await once(server, 'listening')

        const client = new Client(`http://localhost:${server.address().port}`)
          .compose(interceptors.cache())

        try {
          {
            const res = await client.request({
              origin: 'localhost',
              method: 'GET',
              path: '/',
              headers: {
                authorization: 'Bearer token123'
              }
            })
            equal(requestsToOrigin, 1)
            strictEqual(await res.body.text(), 'authenticated Bearer token123 1')
          }

          {
            const res = await client.request({
              origin: 'localhost',
              method: 'GET',
              path: '/'
            })
            equal(requestsToOrigin, 2)
            strictEqual(await res.body.text(), 'authenticated (no-auth) 2')
          }
        } finally {
          await client.close()
          await new Promise(resolve => server.close(resolve))
        }
      }
    })

    test('does not crash on mixed unqualified and qualified private directives', async () => {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.setHeader('cache-control', 'public, max-age=60, private, private="hdr"')
        res.end(`response ${requestsToOrigin}`)
      }).listen(0)

      await once(server, 'listening')

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      try {
        const res = await client.request({
          origin: 'localhost',
          method: 'GET',
          path: '/'
        })
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'response 1')
      } finally {
        await client.close()
        await new Promise(resolve => server.close(resolve))
      }
    })

    test('does not cache response when request has Authorization and response only has max-age', async () => {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.setHeader('cache-control', 'max-age=60')
        res.end('authenticated')
      }).listen(0)

      after(() => server.close())
      await once(server, 'listening')

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      after(() => client.close())

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          authorization: 'Bearer token123'
        }
      }

      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'authenticated')
      }

      {
        const res = await client.request(request)
        equal(requestsToOrigin, 2)
        strictEqual(await res.body.text(), 'authenticated')
      }
    })

    test('does not cache response when request has empty Authorization and response only has max-age', async () => {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.setHeader('cache-control', 'max-age=60')
        res.end(`authenticated ${requestsToOrigin}`)
      }).listen(0)

      after(() => server.close())
      await once(server, 'listening')

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      after(() => client.close())

      {
        const res = await client.request({
          origin: 'localhost',
          method: 'GET',
          path: '/',
          headers: {
            authorization: ''
          }
        })
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'authenticated 1')
      }

      {
        const res = await client.request({
          origin: 'localhost',
          method: 'GET',
          path: '/'
        })
        equal(requestsToOrigin, 2)
        strictEqual(await res.body.text(), 'authenticated 2')
      }
    })

    test('does not cache response when request has Authorization and no cache directives', async () => {
      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        requestsToOrigin++
        res.end('authenticated')
      }).listen(0)

      after(() => server.close())
      await once(server, 'listening')

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache())

      after(() => client.close())

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          authorization: 'Bearer token123'
        }
      }

      {
        const res = await client.request(request)
        equal(requestsToOrigin, 1)
        strictEqual(await res.body.text(), 'authenticated')
      }

      {
        const res = await client.request(request)
        equal(requestsToOrigin, 2)
        strictEqual(await res.body.text(), 'authenticated')
      }
    })
  })
})
