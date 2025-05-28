'use strict'

const { createServer } = require('node:http')
const { describe, test, after } = require('node:test')
const { once } = require('node:events')
const { equal, strictEqual, notEqual, fail } = require('node:assert')
const FakeTimers = require('@sinonjs/fake-timers')
const { Client, interceptors, cacheStores: { MemoryCacheStore } } = require('../../index')

describe('Cache Interceptor', () => {
  test('caches request', async () => {
    let requestsToOrigin = 0
    const server = createServer((_, res) => {
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
    const server = createServer((req, res) => {
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

  test('stale responses are revalidated before deleteAt (if-modified-since)', async () => {
    const clock = FakeTimers.install({
      shouldClearNativeTimers: true
    })

    let requestsToOrigin = 0
    let revalidationRequests = 0
    const server = createServer((req, res) => {
      res.setHeader('date', 0)
      res.setHeader('cache-control', 's-maxage=1, stale-while-revalidate=10')

      if (req.headers['if-modified-since']) {
        revalidationRequests++

        if (revalidationRequests === 2) {
          res.end('updated')
        } else {
          res.statusCode = 304
          res.end()
        }
      } else {
        requestsToOrigin++
        res.end('asd')
      }
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose((dispatch) => {
        return (opts, handler) => {
          if (opts.headers) {
            strictEqual(Object.prototype.hasOwnProperty.call(opts.headers, 'if-none-match'), false)
          }
          return dispatch(opts, handler)
        }
      })
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
      clock.uninstall()
    })

    await once(server, 'listening')

    strictEqual(requestsToOrigin, 0)
    strictEqual(revalidationRequests, 0)

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
      equal(requestsToOrigin, 1)
      equal(revalidationRequests, 0)
      strictEqual(await res.body.text(), 'asd')
    }

    clock.tick(1500)

    // Response is now stale, the origin should get a revalidation request
    {
      const res = await client.request(request)
      equal(requestsToOrigin, 1)
      equal(revalidationRequests, 1)
      strictEqual(await res.body.text(), 'asd')
    }

    // Response is still stale, but revalidation should fail now.
    {
      const res = await client.request(request)
      equal(requestsToOrigin, 1)
      equal(revalidationRequests, 2)
      strictEqual(await res.body.text(), 'updated')
    }
  })

  test('stale responses are revalidated before deleteAt (if-none-match)', async () => {
    const clock = FakeTimers.install({
      shouldClearNativeTimers: true
    })

    let requestsToOrigin = 0
    let revalidationRequests = 0
    let serverError
    const server = createServer((req, res) => {
      res.setHeader('date', 0)
      res.setHeader('cache-control', 's-maxage=1, stale-while-revalidate=10')

      try {
        if (req.headers['if-none-match']) {
          revalidationRequests++

          equal(req.headers['if-none-match'], '"asd123"')

          if (revalidationRequests === 2) {
            res.end('updated')
          } else {
            res.statusCode = 304
            res.end()
          }
        } else {
          requestsToOrigin++
          res.setHeader('etag', '"asd123"')
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
      equal(revalidationRequests, 0)
      strictEqual(await res.body.text(), 'asd')
    }

    clock.tick(1500)

    // Response is now stale, the origin should get a revalidation request
    {
      const res = await client.request(request)
      if (serverError) {
        throw serverError
      }

      equal(requestsToOrigin, 1)
      equal(revalidationRequests, 1)
      strictEqual(await res.body.text(), 'asd')
    }

    // Response is still stale, but revalidation should fail now.
    {
      const res = await client.request(request)
      if (serverError) {
        throw serverError
      }

      equal(requestsToOrigin, 1)
      equal(revalidationRequests, 2)
      strictEqual(await res.body.text(), 'updated')
    }
  })

  test('vary headers are present in revalidation request', async () => {
    const clock = FakeTimers.install({
      shouldClearNativeTimers: true
    })

    let requestsToOrigin = 0
    let revalidationRequests = 0
    let serverError
    const server = createServer((req, res) => {
      res.setHeader('date', 0)
      res.setHeader('cache-control', 's-maxage=1, stale-while-revalidate=10')

      try {
        const ifNoneMatch = req.headers['if-none-match']

        if (ifNoneMatch) {
          revalidationRequests++
          notEqual(req.headers.a, undefined)
          notEqual(req.headers.b, undefined)

          res.statusCode = 304
          res.end()
        } else {
          requestsToOrigin++
          res.setHeader('vary', 'a, b')
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
      method: 'GET',
      headers: {
        a: 'asd',
        b: 'asd'
      }
    }

    {
      const response = await client.request(request)
      if (serverError) {
        throw serverError
      }

      strictEqual(requestsToOrigin, 1)
      strictEqual(await response.body.text(), 'asd')
    }

    clock.tick(1500)

    {
      const response = await client.request(request)
      if (serverError) {
        throw serverError
      }

      strictEqual(requestsToOrigin, 1)
      strictEqual(revalidationRequests, 1)
      strictEqual(await response.body.text(), 'asd')
    }
  })

  test('unsafe methods cause resource to be purged from cache', async () => {
    const server = createServer((_, res) => res.end('asd')).listen(0)

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
    const server = createServer((_, res) => {
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
          delete () {}
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
    const server = createServer((_, res) => {
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
    const server = createServer((_, res) => {
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
    const server = createServer((_, res) => {
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
      const server = createServer((_, res) => {
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
      const server = createServer((req, res) => {
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
      equal(revalidationRequests, 1)
    })

    test('min-fresh', async () => {
      const clock = FakeTimers.install({
        shouldClearNativeTimers: true
      })

      let requestsToOrigin = 0
      const server = createServer((_, res) => {
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
      const server = createServer((req, res) => {
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
      const server = createServer((_, res) => {
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
      const server = createServer((_, res) => {
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
      const server = createServer((_, res) => {
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

      // Send third request. This is now stale, the revalidation request should
      //  fail but the response should still be served from cache.
      {
        const response = await client.request({
          origin: 'localhost',
          path: '/',
          method: 'GET',
          headers: {
            'cache-control': 'stale-if-error=20'
          }
        })
        equal(requestsToOrigin, 2)
        equal(response.statusCode, 200)
        equal(await response.body.text(), 'asd')
      }

      // Send a fourth request. This is stale and w/o stale-if-error, so we
      //  should get the error here.
      {
        const response = await client.request({
          origin: 'localhost',
          path: '/',
          method: 'GET'
        })
        equal(requestsToOrigin, 3)
        equal(response.statusCode, 500)
      }

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
})
