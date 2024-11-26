'use strict'

const { describe, test, after } = require('node:test')
const { strictEqual, notEqual, fail, equal } = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const FakeTimers = require('@sinonjs/fake-timers')
const { Client, interceptors, cacheStores } = require('../../index')

describe('Cache Interceptor', () => {
  test('doesn\'t cache request w/ no cache-control header', async () => {
    let requestsToOrigin = 0

    const server = createServer((_, res) => {
      requestsToOrigin++
      res.end('asd')
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
    let response = await client.request({
      origin: 'localhost',
      method: 'GET',
      path: '/'
    })
    strictEqual(requestsToOrigin, 1)
    strictEqual(await response.body.text(), 'asd')

    // Send second request that should be handled by cache
    response = await client.request({
      origin: 'localhost',
      method: 'GET',
      path: '/'
    })
    strictEqual(requestsToOrigin, 2)
    strictEqual(await response.body.text(), 'asd')
  })

  test('caches request successfully', async () => {
    let requestsToOrigin = 0

    const server = createServer((_, res) => {
      requestsToOrigin++
      res.setHeader('cache-control', 'public, s-maxage=10')
      res.end('asd')
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
    let response = await client.request({
      origin: 'localhost',
      method: 'GET',
      path: '/'
    })
    strictEqual(requestsToOrigin, 1)
    strictEqual(await response.body.text(), 'asd')

    // Send second request that should be handled by cache
    response = await client.request({
      origin: 'localhost',
      method: 'GET',
      path: '/'
    })
    strictEqual(requestsToOrigin, 1)
    strictEqual(await response.body.text(), 'asd')
    strictEqual(response.headers.age, '0')
  })

  test('respects vary header', async () => {
    let requestsToOrigin = 0

    const server = createServer((req, res) => {
      requestsToOrigin++
      res.setHeader('cache-control', 'public, s-maxage=10')
      res.setHeader('vary', 'some-header, another-header')

      if (req.headers['some-header'] === 'abc123') {
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

    strictEqual(requestsToOrigin, 0)

    // Send initial request. This should reach the origin
    let response = await client.request({
      origin: 'localhost',
      method: 'GET',
      path: '/',
      headers: {
        'some-header': 'abc123',
        'another-header': '123abc'
      }
    })
    strictEqual(requestsToOrigin, 1)
    strictEqual(await response.body.text(), 'asd')

    // Make another request with changed headers, this should miss
    const secondResponse = await client.request({
      method: 'GET',
      path: '/',
      headers: {
        'some-header': 'qwerty',
        'another-header': 'asdfg'
      }
    })
    strictEqual(requestsToOrigin, 2)
    strictEqual(await secondResponse.body.text(), 'dsa')

    // Resend the first request again which should still be cahced
    response = await client.request({
      origin: 'localhost',
      method: 'GET',
      path: '/',
      headers: {
        'some-header': 'abc123',
        'another-header': '123abc'
      }
    })
    strictEqual(requestsToOrigin, 2)
    strictEqual(await response.body.text(), 'asd')
  })

  test('vary headers are present in revalidation request', async () => {
    const clock = FakeTimers.install({
      shouldClearNativeTimers: true
    })

    let requestsToOrigin = 0
    let revalidationRequests = 0
    const server = createServer((req, res) => {
      res.setHeader('date', 0)
      res.setHeader('cache-control', 's-maxage=1, stale-while-revalidate=10')

      if (requestsToOrigin === 0) {
        requestsToOrigin++
        res.setHeader('vary', 'a, b')
        res.setHeader('etag', '"asd"')
        res.end('asd')
      } else {
        revalidationRequests++
        notEqual(req.headers['if-none-match'], undefined)
        notEqual(req.headers['a'], undefined)
        notEqual(req.headers['b'], undefined)

        res.statusCode = 304
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
      strictEqual(requestsToOrigin, 1)
      strictEqual(await response.body.text(), 'asd')
    }

    clock.tick(1500)

    {
      const response = await client.request(request)
      strictEqual(requestsToOrigin, 1)
      strictEqual(revalidationRequests, 1)
      strictEqual(await response.body.text(), 'asd')
    }
  })

  test('revalidates request when needed', async () => {
    let requestsToOrigin = 0

    const clock = FakeTimers.install({
      shouldClearNativeTimers: true
    })

    const server = createServer((req, res) => {
      res.setHeader('date', 0)
      res.setHeader('cache-control', 'public, s-maxage=1, stale-while-revalidate=10')

      requestsToOrigin++

      if (requestsToOrigin > 1) {
        notEqual(req.headers['if-modified-since'], undefined)

        if (requestsToOrigin === 3) {
          res.end('asd123')
        } else {
          res.statusCode = 304
          res.end()
        }
      } else {
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

    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    // Send initial request. This should reach the origin
    let response = await client.request(request)
    strictEqual(requestsToOrigin, 1)
    strictEqual(await response.body.text(), 'asd')

    clock.tick(1500)

    // Now we send two more requests. Both of these should reach the origin,
    //  but now with a conditional header asking if the resource has been
    //  updated. These need to be ran after the response is stale.
    // No update for the second request
    response = await client.request(request)
    strictEqual(requestsToOrigin, 2)
    strictEqual(await response.body.text(), 'asd')

    // This should be updated, even though the value isn't expired.
    response = await client.request(request)
    strictEqual(requestsToOrigin, 3)
    strictEqual(await response.body.text(), 'asd123')
  })

  test('revalidates request w/ etag when provided', async (t) => {
    let requestsToOrigin = 0

    const clock = FakeTimers.install({
      shouldClearNativeTimers: true
    })

    const server = createServer((req, res) => {
      res.setHeader('date', 0)
      res.setHeader('cache-control', 'public, s-maxage=1, stale-while-revalidate=10')
      requestsToOrigin++

      if (requestsToOrigin > 1) {
        equal(req.headers['if-none-match'], '"asd123"')

        if (requestsToOrigin === 3) {
          res.end('asd123')
        } else {
          res.statusCode = 304
          res.end()
        }
      } else {
        res.setHeader('etag', '"asd123"')
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

    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    // Send initial request. This should reach the origin
    let response = await client.request(request)
    strictEqual(requestsToOrigin, 1)
    strictEqual(await response.body.text(), 'asd')

    clock.tick(1500)

    // Now we send two more requests. Both of these should reach the origin,
    //  but now with a conditional header asking if the resource has been
    //  updated. These need to be ran after the response is stale.
    // No update for the second request
    response = await client.request(request)
    strictEqual(requestsToOrigin, 2)
    strictEqual(await response.body.text(), 'asd')

    // This should be updated, even though the value isn't expired.
    response = await client.request(request)
    strictEqual(requestsToOrigin, 3)
    strictEqual(await response.body.text(), 'asd123')
  })

  test('respects cache store\'s isFull property', async () => {
    const server = createServer((_, res) => {
      res.end('asd')
    }).listen(0)

    after(() => server.close())
    await once(server, 'listening')

    const store = new cacheStores.MemoryCacheStore()
    Object.defineProperty(store, 'isFull', {
      value: true
    })

    store.createWriteStream = (...args) => {
      fail('shouln\'t have reached this')
    }

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache({ store }))

    await client.request({
      origin: 'localhost',
      method: 'GET',
      path: '/',
      headers: {
        'some-header': 'abc123',
        'another-header': '123abc'
      }
    })
  })

  test('unsafe methods call the store\'s delete function', async () => {
    const server = createServer((_, res) => {
      res.end('asd')
    }).listen(0)

    after(() => server.close())
    await once(server, 'listening')

    let deleteCalled = false
    const store = new cacheStores.MemoryCacheStore()

    const originaldelete = store.delete.bind(store)
    store.delete = (key) => {
      deleteCalled = true
      originaldelete(key)
    }

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache({
        store,
        methods: ['GET'] // explicitly only cache GET methods
      }))

    // Make sure safe methods that we want to cache don't cause a cache purge
    await client.request({
      origin: 'localhost',
      method: 'GET',
      path: '/'
    })

    equal(deleteCalled, false)

    // Make sure other safe methods that we don't want to cache don't cause a cache purge
    await client.request({
      origin: 'localhost',
      method: 'HEAD',
      path: '/'
    })

    strictEqual(deleteCalled, false)

    // Make sure the common unsafe methods cause cache purges
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      deleteCalled = false

      await client.request({
        origin: 'localhost',
        method,
        path: '/'
      })

      equal(deleteCalled, true, method)
    }
  })

  test('necessary headers are stripped', async () => {
    let requestsToOrigin = 0
    const server = createServer((req, res) => {
      requestsToOrigin++
      res.setHeader('cache-control', 'public, s-maxage=10, no-cache=should-be-stripped')
      res.setHeader('should-be-stripped', 'hello world')
      res.setHeader('should-not-be-stripped', 'dsa321')

      res.end('asd')
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

    // Send initial request. This should reach the origin
    {
      const response = await client.request(request)
      equal(requestsToOrigin, 1)
      strictEqual(await response.body.text(), 'asd')
      equal(response.headers['should-be-stripped'], 'hello world')
      equal(response.headers['should-not-be-stripped'], 'dsa321')
    }

    // Send second request, this should hit the cache
    {
      const response = await client.request(request)
      equal(requestsToOrigin, 1)
      strictEqual(await response.body.text(), 'asd')
      equal(response.headers['should-be-stripped'], undefined)
      equal(response.headers['should-not-be-stripped'], 'dsa321')
    }
  })

  test('necessary headers are stripped (quotes)', async () => {
    let requestsToOrigin = 0
    const server = createServer((_, res) => {
      requestsToOrigin++
      res.setHeader('connection', 'a, b')
      res.setHeader('a', '123')
      res.setHeader('b', '123')
      res.setHeader('cache-control', 's-maxage=3600, no-cache="should-be-stripped, should-be-stripped2"')
      res.setHeader('should-be-stripped', 'hello world')
      res.setHeader('should-be-stripped2', 'hello world')
      res.setHeader('should-not-be-stripped', 'dsa321')

      res.end('asd')
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

    // Send initial request. This should reach the origin
    {
      const response = await client.request(request)
      equal(requestsToOrigin, 1)
      strictEqual(await response.body.text(), 'asd')
      equal(response.headers['a'], '123')
      equal(response.headers['b'], '123')
      equal(response.headers['should-be-stripped'], 'hello world')
      equal(response.headers['should-be-stripped2'], 'hello world')
      equal(response.headers['should-not-be-stripped'], 'dsa321')
    }

    // Send second request, this should hit the cache
    {
      const response = await client.request(request)
      equal(requestsToOrigin, 1)
      strictEqual(await response.body.text(), 'asd')
      equal(response.headers['a'], undefined)
      equal(response.headers['b'], undefined)
      equal(response.headers['should-be-stripped'], undefined)
      equal(response.headers['should-be-stripped2'], undefined)
    }
  })

  test('requests w/ unsafe methods never get cached', async () => {
    const server = createServer((req, res) => {
      res.setHeader('cache-control', 'public, s-maxage=1')
      res.end('asd')
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

  for (const maxAgeHeader of ['s-maxage', 'max-age']) {
    test(`stale-while-revalidate w/ ${maxAgeHeader}`, async () => {
      const clock = FakeTimers.install({
        shouldClearNativeTimers: true
      })

      let requestsToOrigin = 0
      let revalidationRequests = 0
      const server = createServer((req, res) => {
        res.setHeader('date', 0)

        if (req.headers['if-none-match']) {
          revalidationRequests++
          if (req.headers['if-none-match'] !== '"asd"') {
            fail(`etag mismatch: ${req.headers['if-none-match']}`)
          }

          res.statusCode = 304
          res.end()
        } else {
          requestsToOrigin++
          res.setHeader('cache-control', 'public, max-age=1, stale-while-revalidate=4')
          res.setHeader('etag', '"asd"')
          res.end('asd')
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
      strictEqual(revalidationRequests, 0)

      // Send first request, this will hit the origin
      {
        const response = await client.request({
          origin: 'localhost',
          path: '/',
          method: 'GET'
        })
        equal(requestsToOrigin, 1)
        strictEqual(revalidationRequests, 0)
        equal(response.statusCode, 200)
        equal(await response.body.text(), 'asd')
      }

      // Send second request, this will be cached.
      {
        const response = await client.request({
          origin: 'localhost',
          path: '/',
          method: 'GET'
        })
        equal(requestsToOrigin, 1)
        strictEqual(revalidationRequests, 0)
        equal(response.statusCode, 200)
        equal(await response.body.text(), 'asd')
      }

      clock.tick(1500)

      // Send third request, this should be revalidated
      {
        const response = await client.request({
          origin: 'localhost',
          path: '/',
          method: 'GET'
        })
        equal(requestsToOrigin, 1)
        strictEqual(revalidationRequests, 1)
        equal(response.statusCode, 200)
        equal(await response.body.text(), 'asd')
      }

      clock.tick(5000)

      // Send fourth request, this should be a new request entirely
      {
        const response = await client.request({
          origin: 'localhost',
          path: '/',
          method: 'GET'
        })
        equal(requestsToOrigin, 2)
        strictEqual(revalidationRequests, 1)
        equal(response.statusCode, 200)
        equal(await response.body.text(), 'asd')
      }
    })
  }

  test('stale-if-error from response works as expected', async () => {
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
        method: 'GET'
      })
      equal(requestsToOrigin, 2)
      equal(response.statusCode, 200)
      equal(await response.body.text(), 'asd')
    }

    clock.tick(25000)

    // Send fourth request. We're now outside the stale-if-error threshold and
    //  should see the error.
    {
      const response = await client.request({
        origin: 'localhost',
        path: '/',
        method: 'GET'
      })
      equal(requestsToOrigin, 3)
      equal(response.statusCode, 500)
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

  describe('Client-side directives', () => {
    test('max-age', async () => {
      const clock = FakeTimers.install({
        shouldClearNativeTimers: true
      })

      let requestsToOrigin = 0
      const server = createServer((_, res) => {
        requestsToOrigin++
        res.setHeader('cache-control', 'public, s-maxage=100')
        res.end('asd')
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

      // Send initial request. This should reach the origin
      let response = await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/'
      })
      strictEqual(requestsToOrigin, 1)
      strictEqual(await response.body.text(), 'asd')

      // Send second request that should be handled by cache
      response = await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/'
      })
      strictEqual(requestsToOrigin, 1)
      strictEqual(await response.body.text(), 'asd')
      strictEqual(response.headers.age, '0')

      // Send third request w/ the directive, this should be handled by the cache
      response = await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          'cache-control': 'max-age=5'
        }
      })
      strictEqual(requestsToOrigin, 1)
      strictEqual(await response.body.text(), 'asd')

      clock.tick(6000)

      // Send fourth request w/ the directive, age should be 6 now so this
      //  should hit the origin
      response = await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          'cache-control': 'max-age=5'
        }
      })
      strictEqual(requestsToOrigin, 2)
      strictEqual(await response.body.text(), 'asd')
    })

    test('max-stale', async () => {
      let requestsToOrigin = 0

      const clock = FakeTimers.install({
        shouldClearNativeTimers: true
      })

      const server = createServer((req, res) => {
        res.setHeader('date', 0)
        res.setHeader('cache-control', 'public, s-maxage=1, stale-while-revalidate=10')

        if (requestsToOrigin === 1) {
          notEqual(req.headers['if-modified-since'], undefined)

          res.statusCode = 304
          res.end()
        } else {
          res.end('asd')
        }

        requestsToOrigin++
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

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      // Send initial request. This should reach the origin
      let response = await client.request(request)
      strictEqual(requestsToOrigin, 1)
      strictEqual(await response.body.text(), 'asd')

      clock.tick(1500)

      // Now we send a second request. This should be within the max stale
      //  threshold, so a request shouldn't be made to the origin
      response = await client.request({
        ...request,
        headers: {
          'cache-control': 'max-stale=5'
        }
      })
      strictEqual(requestsToOrigin, 1)
      strictEqual(await response.body.text(), 'asd')

      // Send a third request. This shouldn't be within the max stale threshold
      //  so a request should be made to the origin
      response = await client.request({
        ...request,
        headers: {
          'cache-control': 'max-stale=0'
        }
      })
      strictEqual(requestsToOrigin, 2)
      strictEqual(await response.body.text(), 'asd')
    })

    test('min-fresh', async () => {
      let requestsToOrigin = 0

      const clock = FakeTimers.install({
        shouldClearNativeTimers: true
      })

      const server = createServer((req, res) => {
        requestsToOrigin++
        res.setHeader('date', 0)
        res.setHeader('cache-control', 'public, s-maxage=10')
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

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      // Send initial request. This should reach the origin
      let response = await client.request(request)
      strictEqual(requestsToOrigin, 1)
      strictEqual(await response.body.text(), 'asd')

      // Fast forward more. Response has 8sec TTL left after
      clock.tick(2000)

      // Now we send a second request. This should be within the threshold, so
      //  a request shouldn't be made to the origin
      response = await client.request({
        ...request,
        headers: {
          'cache-control': 'min-fresh=5'
        }
      })
      strictEqual(requestsToOrigin, 1)
      strictEqual(await response.body.text(), 'asd')

      // Fast forward more. Response has 2sec TTL left after
      clock.tick(6000)

      // Send the second request again, this time it shouldn't be within the
      //  threshold and a request should be made to the origin.
      response = await client.request({
        ...request,
        headers: {
          'cache-control': 'min-fresh=5'
        }
      })
      strictEqual(requestsToOrigin, 2)
      strictEqual(await response.body.text(), 'asd')
    })

    test('no-cache', async () => {
      let requestsToOrigin = 0
      const server = createServer((req, res) => {
        if (requestsToOrigin === 1) {
          notEqual(req.headers['if-modified-since'], undefined)
          res.statusCode = 304
          res.end()
        } else {
          res.setHeader('cache-control', 'public, s-maxage=100')
          res.end('asd')
        }

        requestsToOrigin++
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
      let response = await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          'cache-control': 'no-cache'
        }
      })
      strictEqual(requestsToOrigin, 1)
      strictEqual(await response.body.text(), 'asd')

      // Send second request, a validation request should be sent
      response = await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          'cache-control': 'no-cache'
        }
      })
      strictEqual(requestsToOrigin, 2)
      strictEqual(await response.body.text(), 'asd')

      // Send third request w/o no-cache, this should be handled by the cache
      response = await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/'
      })
      strictEqual(requestsToOrigin, 2)
      strictEqual(await response.body.text(), 'asd')
    })

    test('no-store', async () => {
      const server = createServer((req, res) => {
        res.setHeader('cache-control', 'public, s-maxage=100')
        res.end('asd')
      }).listen(0)

      const store = new cacheStores.MemoryCacheStore()
      store.createWriteStream = (...args) => {
        fail('shouln\'t have reached this')
      }

      const client = new Client(`http://localhost:${server.address().port}`)
        .compose(interceptors.cache({ store }))

      after(async () => {
        server.close()
        await client.close()
      })

      await once(server, 'listening')

      // Send initial request. This should reach the origin
      const response = await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          'cache-control': 'no-store'
        }
      })
      strictEqual(await response.body.text(), 'asd')
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
      let response = await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/'
      })
      equal(requestsToOrigin, 1)
      strictEqual(await response.body.text(), 'asd')

      // Send second request, this shouldn't reach the origin
      response = await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          'cache-control': 'only-if-cached'
        }
      })
      equal(requestsToOrigin, 1)
      strictEqual(await response.body.text(), 'asd')

      // Send third request to an uncached resource, this should return a 504
      response = await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/bla',
        headers: {
          'cache-control': 'only-if-cached'
        }
      })
      equal(response.statusCode, 504)

      // Send fourth request to an uncached resource w/ a , this should return a 504
      response = await client.request({
        origin: 'localhost',
        method: 'DELETE',
        path: '/asd123',
        headers: {
          'cache-control': 'only-if-cached'
        }
      })
      equal(response.statusCode, 504)
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
