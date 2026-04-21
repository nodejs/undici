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

  test('expires caching', async () => {
    const clock = FakeTimers.install({
      shouldClearNativeTimers: true
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
      shouldClearNativeTimers: true
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
      shouldClearNativeTimers: true
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
      shouldClearNativeTimers: true
    })

    let requestsToOrigin = 0
    let revalidationRequests = 0
    let serverError
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.setHeader('date', 0)
      res.setHeader('cache-control', 's-maxage=1, stale-while-revalidate=10')

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

  test('stale-if-error (response)', async () => {
    const clock = FakeTimers.install({
      shouldClearNativeTimers: true
    })

    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
      res.setHeader('date', 0)

      requestsToOrigin++
      if (requestsToOrigin === 1) {
        // First request
        res.setHeader('cache-control', 'public, s-maxage=10, stale-if-error=20')
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
        shouldClearNativeTimers: true
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

      // Send second request, should be served by the cache since it's within
      //  the window
      await client.request({
        ...request,
        headers: {
          'cache-control': 'max-age=5'
        }
      })
      equal(requestsToOrigin, 1)

      clock.tick(6000)

      // Send third request, should reach the origin
      await client.request({
        ...request,
        headers: {
          'cache-control': 'max-age=5'
        }
      })
      equal(requestsToOrigin, 2)
    })

    test('max-stale', async () => {
      const clock = FakeTimers.install({
        shouldClearNativeTimers: true
      })

      let requestsToOrigin = 0
      let revalidationRequests = 0
      const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
        res.setHeader('date', 0)
        res.setHeader('cache-control', 'public, s-maxage=1, stale-while-revalidate=10')

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

    test('min-fresh', async () => {
      const clock = FakeTimers.install({
        shouldClearNativeTimers: true
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
        shouldClearNativeTimers: true
      })

      let requestsToOrigin = 0
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        res.setHeader('date', 0)

        requestsToOrigin++
        if (requestsToOrigin === 1) {
          // First request, send stale-while-revalidate to keep the value in the cache
          res.setHeader('cache-control', 'public, s-maxage=10, stale-while-revalidate=20')
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
      res.setHeader('cache-control', 's-maxage=1, stale-while-revalidate=10')

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
      res.setHeader('cache-control', 's-maxage=1, stale-while-revalidate=10')

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
      const clock = FakeTimers.install({ now: 1000 })
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
      const clock = FakeTimers.install({ now: 1000, shouldClearNativeTimers: true })
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

    test('immutable response has deleteAt of ~1 year', async () => {
      const clock = FakeTimers.install({ now: 1000 })
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
      const clock = FakeTimers.install({ now: 1000 })
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
