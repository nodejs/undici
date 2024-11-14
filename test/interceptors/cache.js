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
})
