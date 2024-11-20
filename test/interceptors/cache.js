'use strict'

const { describe, test, after } = require('node:test')
const { strictEqual, notEqual, fail, equal } = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const FakeTimers = require('@sinonjs/fake-timers')
const { Client, interceptors, cacheStores } = require('../../index')
const { tick } = require('../../lib/util/timers')

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

  test('revalidates request when needed', async () => {
    let requestsToOrigin = 0

    const clock = FakeTimers.install({
      shouldClearNativeTimers: true
    })
    tick(0)

    const server = createServer((req, res) => {
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
    tick(1500)

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
    tick(0)

    const server = createServer((req, res) => {
      res.setHeader('cache-control', 'public, s-maxage=1, stale-while-revalidate=10')
      requestsToOrigin++

      if (requestsToOrigin > 1) {
        equal(req.headers['etag'], '"asd123"')

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
    tick(1500)

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
    const server = createServer((req, res) => {
      res.setHeader('cache-control', 'public, s-maxage=1, stale-while-revalidate=10, no-cache=should-be-stripped')
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
    const response = await client.request(request)
    strictEqual(await response.body.text(), 'asd')
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

  describe('Client-side directives', () => {
    test('max-age', async () => {
      const clock = FakeTimers.install({
        shouldClearNativeTimers: true
      })
      tick(0)

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
      tick(6000)

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
      tick(0)

      const server = createServer((req, res) => {
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
      tick(1500)

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
      tick(0)

      const server = createServer((req, res) => {
        requestsToOrigin++
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
      tick(2000)

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
      tick(6000)

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
  })
})
