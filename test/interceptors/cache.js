'use strict'

const { createServer } = require('node:http')
const { describe, test, after } = require('node:test')
const { once } = require('node:events')
const { setTimeout: sleep } = require('node:timers/promises')
const FakeTimers = require('@sinonjs/fake-timers')
const { Client, interceptors, cacheStores: { MemoryCacheStore } } = require('../../index')

describe('Cache Interceptor', () => {
  test('caches request', async (t) => {
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
    t.assert.strictEqual(requestsToOrigin, 0)

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
      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }

    {
      const res = await client.request(request)
      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }
  })

  test('vary directives used to decide which response to use', async (t) => {
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
      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }

    // Should reach origin
    {
      const res = await client.request(requestB)
      t.assert.strictEqual(requestsToOrigin, 2)
      t.assert.strictEqual(await res.body.text(), 'dsa')
    }

    // Should be cached
    {
      const res = await client.request(requestA)
      t.assert.strictEqual(requestsToOrigin, 2)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }

    // Should be cached
    {
      const res = await client.request(requestB)
      t.assert.strictEqual(requestsToOrigin, 2)
      t.assert.strictEqual(await res.body.text(), 'dsa')
    }
  })

  test('revalidates reponses with no-cache directive, regardless of cacheByDefault', async (t) => {
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
    t.assert.strictEqual(body1, 'Request count: 1')
    t.assert.strictEqual(requestCount, 1)

    const res2 = await client.request(request)
    const body2 = await res2.body.text()
    t.assert.strictEqual(body2, 'Request count: 2')
    t.assert.strictEqual(requestCount, 2)
  })

  test('expires caching', async (t) => {
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

    t.assert.strictEqual(requestsToOrigin, 0)

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

      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }

    // This is cached
    {
      const res = await client.request(request)
      if (serverError) {
        throw serverError
      }

      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }

    clock.tick(1500)

    // Response is now stale, the origin should get a request
    {
      const res = await client.request(request)
      t.assert.strictEqual(requestsToOrigin, 2)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }

    // Response is now cached, the origin should not get a request
    {
      const res = await client.request(request)
      t.assert.strictEqual(requestsToOrigin, 2)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }
  })

  test('expires caching with Etag', async (t) => {
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

    t.assert.strictEqual(requestsToOrigin, 0)

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

      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }

    // This is cached
    {
      const res = await client.request(request)
      if (serverError) {
        throw serverError
      }

      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }

    clock.tick(1500)

    // Response is now stale, the origin should get a request
    {
      const res = await client.request(request)
      t.assert.strictEqual(requestsToOrigin, 2)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }

    // Response is now cached, the origin should not get a request
    {
      const res = await client.request(request)
      t.assert.strictEqual(requestsToOrigin, 2)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }
  })

  test('max-age caching', async (t) => {
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

    t.assert.strictEqual(requestsToOrigin, 0)

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

      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }

    clock.tick(1500)

    // Response is now stale, the origin should get a request
    {
      const res = await client.request(request)
      t.assert.strictEqual(requestsToOrigin, 2)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }

    // Response is now cached, the origin should not get a request
    {
      const res = await client.request(request)
      t.assert.strictEqual(requestsToOrigin, 2)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }
  })

  test('stale responses are revalidated before deleteAt (if-modified-since)', async (t) => {
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
        if (req.headers['if-modified-since']) {
          t.assert.strictEqual(req.headers['if-modified-since'].length, 29)

          revalidationRequests++

          if (revalidationRequests === 3) {
            res.end('updated')
          } else {
            res.statusCode = 304
            res.end()
          }
        } else {
          requestsToOrigin++
          res.end('asd')
        }
      } catch (err) {
        serverError = err
        res.end()
      }
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose((dispatch) => {
        return (opts, handler) => {
          if (opts.headers) {
            t.assert.strictEqual(Object.prototype.hasOwnProperty.call(opts.headers, 'if-none-match'), false)
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

    t.assert.strictEqual(requestsToOrigin, 0)
    t.assert.strictEqual(revalidationRequests, 0)

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

      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(revalidationRequests, 0)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }

    clock.tick(1500)

    // Response is now stale but within stale-while-revalidate window,
    // should return stale immediately and revalidate in background
    {
      const res = await client.request(request)
      if (serverError) {
        throw serverError
      }

      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await res.body.text(), 'asd')
      // Background revalidation happens asynchronously
    }

    // Wait for background revalidation to complete
    await sleep(100)
    t.assert.strictEqual(revalidationRequests, 1)

    // Response is still stale, will trigger another background revalidation
    {
      const res = await client.request({
        ...request,
        headers: {
          'if-modified-SINCE': 'Thu, 01 Jan 1970 00:00:00 GMT'
        }
      })
      if (serverError) {
        throw serverError
      }

      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }

    // Wait for second background revalidation
    await sleep(100)
    t.assert.strictEqual(revalidationRequests, 2)

    // Third request triggers another background revalidation that returns updated content
    {
      const res = await client.request(request)
      if (serverError) {
        throw serverError
      }

      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await res.body.text(), 'asd') // Still stale initially
    }

    // Wait for third background revalidation
    await sleep(100)
    t.assert.strictEqual(revalidationRequests, 3)

    // Now the cache should have updated content
    {
      const res = await client.request(request)
      if (serverError) {
        throw serverError
      }

      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await res.body.text(), 'updated')
    }
  })

  test('stale responses are revalidated before deleteAt (if-none-match)', async (t) => {
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
        if (req.headers['if-none-match']) {
          revalidationRequests++

          t.assert.strictEqual(req.headers['if-none-match'], '"asd123"')

          if (revalidationRequests === 3) {
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

    t.assert.strictEqual(requestsToOrigin, 0)
    t.assert.strictEqual(revalidationRequests, 0)

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

      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(revalidationRequests, 0)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }

    clock.tick(1500)

    // Response is now stale but within stale-while-revalidate window,
    // should return stale immediately and revalidate in background
    {
      const res = await client.request(request)
      if (serverError) {
        throw serverError
      }

      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await res.body.text(), 'asd')
      // Background revalidation happens asynchronously
    }

    // Wait for background revalidation to complete
    await sleep(100)
    t.assert.strictEqual(revalidationRequests, 1)

    // Response is still stale, will trigger another background revalidation
    {
      const res = await client.request({
        ...request,
        headers: {
          'if-NONE-match': '"nonsense-etag"'
        }
      })
      if (serverError) {
        throw serverError
      }

      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }

    // Wait for second background revalidation
    await sleep(100)
    t.assert.strictEqual(revalidationRequests, 2)

    // Third request triggers another background revalidation that returns updated content
    {
      const res = await client.request(request)
      if (serverError) {
        throw serverError
      }

      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await res.body.text(), 'asd') // Still stale initially
    }

    // Wait for third background revalidation
    await sleep(100)
    t.assert.strictEqual(revalidationRequests, 3)

    // Now the cache should have updated content
    {
      const res = await client.request(request)
      if (serverError) {
        throw serverError
      }

      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await res.body.text(), 'updated')
    }
  })

  test('vary headers are present in revalidation request', async (t) => {
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
          t.assert.notEqual(req.headers.a, undefined)
          t.assert.notEqual(req.headers['b-mixed-case'], undefined)

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

    t.assert.strictEqual(requestsToOrigin, 0)
    t.assert.strictEqual(revalidationRequests, 0)

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

      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await response.body.text(), 'asd')
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

      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await response.body.text(), 'asd')
    }

    // Wait for background revalidation to complete
    await sleep(100)
    t.assert.strictEqual(revalidationRequests, 1)
  })

  test('unsafe methods cause resource to be purged from cache', async (t) => {
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
    t.assert.strictEqual(deleteCalled, false)

    // Make sure the common unsafe methods cause cache purges
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      deleteCalled = false

      await client.request({
        ...request,
        method
      })

      t.assert.strictEqual(deleteCalled, true, method)
    }
  })

  test('unsafe methods aren\'t cached', async (t) => {
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
            t.assert.fail(key.method)
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

  test('necessary headers are stripped', async (t) => {
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
      t.assert.strictEqual(requestToOrigin, 1)
      t.assert.strictEqual(res.headers['should-not-be-stripped'], 'asd')

      for (const header of headers) {
        t.assert.strictEqual(res.headers[header], 'asd')
      }
    }

    {
      const res = await client.request(request)
      t.assert.strictEqual(requestToOrigin, 1)
      t.assert.strictEqual(res.headers['should-not-be-stripped'], 'asd')
      t.assert.strictEqual(res.headers['transfer-encoding'], undefined)

      for (const header of headers) {
        t.assert.strictEqual(res.headers[header], undefined)
      }
    }
  })

  test('cacheByDefault', async (t) => {
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

    t.assert.strictEqual(requestsToOrigin, 0)

    // Should hit the origin
    {
      const res = await client.request({
        origin: 'localhost',
        path: '/',
        method: 'GET'
      })
      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }

    // Should hit the cache
    {
      const res = await client.request({
        origin: 'localhost',
        path: '/',
        method: 'GET'
      })
      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await res.body.text(), 'asd')
    }
  })

  test('stale-if-error (response)', async (t) => {
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

    t.assert.strictEqual(requestsToOrigin, 0)

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
      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(response.statusCode, 200)
      t.assert.strictEqual(await response.body.text(), 'asd')
    }

    // Send second request. It isn't stale yet, so this should be from the
    //  cache and succeed
    {
      const response = await client.request(request)
      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(response.statusCode, 200)
      t.assert.strictEqual(await response.body.text(), 'asd')
    }

    clock.tick(15000)

    // Send third request. This is now stale, the revalidation request should
    //  fail but the response should still be served from cache.
    {
      const response = await client.request(request)
      t.assert.strictEqual(requestsToOrigin, 2)
      t.assert.strictEqual(response.statusCode, 200)
      t.assert.strictEqual(await response.body.text(), 'asd')
    }

    clock.tick(25000)

    // Send fourth request. We're now outside the stale-if-error threshold and
    //  should see the error.
    {
      const response = await client.request(request)
      t.assert.strictEqual(requestsToOrigin, 3)
      t.assert.strictEqual(response.statusCode, 500)
    }
  })

  describe('Client-side directives', () => {
    test('max-age', async (t) => {
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

      t.assert.strictEqual(requestsToOrigin, 0)

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
      t.assert.strictEqual(requestsToOrigin, 1)

      // Send second request, should be served by the cache since it's within
      //  the window
      await client.request({
        ...request,
        headers: {
          'cache-control': 'max-age=5'
        }
      })
      t.assert.strictEqual(requestsToOrigin, 1)

      clock.tick(6000)

      // Send third request, should reach the origin
      await client.request({
        ...request,
        headers: {
          'cache-control': 'max-age=5'
        }
      })
      t.assert.strictEqual(requestsToOrigin, 2)
    })

    test('max-stale', async (t) => {
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

      t.assert.strictEqual(requestsToOrigin, 0)

      /**
       * @type {import('../../types/dispatcher').default.RequestOptions}
       */
      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      await client.request(request)
      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(revalidationRequests, 0)

      clock.tick(1500)

      // Send second request within the max-stale threshold
      await client.request({
        ...request,
        headers: {
          'cache-control': 'max-stale=5'
        }
      })
      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(revalidationRequests, 0)

      // Send third request outside the max-stale threshold
      await client.request({
        ...request,
        headers: {
          'cache-control': 'max-stale=0'
        }
      })
      t.assert.strictEqual(requestsToOrigin, 1)

      // Wait for background revalidation to complete
      await sleep(100)
      t.assert.strictEqual(revalidationRequests, 1)
    })

    test('min-fresh', async (t) => {
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

      t.assert.strictEqual(requestsToOrigin, 0)

      /**
       * @type {import('../../types/dispatcher').default.RequestOptions}
       */
      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      await client.request(request)
      t.assert.strictEqual(requestsToOrigin, 1)

      // Fast forward to response having 8sec ttl
      clock.tick(2000)

      // Send request within the threshold
      await client.request({
        ...request,
        headers: {
          'cache-control': 'min-fresh=5'
        }
      })
      t.assert.strictEqual(requestsToOrigin, 1)

      // Fast forward again, response has 2sec ttl
      clock.tick(6000)

      await client.request({
        ...request,
        headers: {
          'cache-control': 'min-fresh=5'
        }
      })
      t.assert.strictEqual(requestsToOrigin, 2)
    })

    test('no-cache', async (t) => {
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

      t.assert.strictEqual(requestsToOrigin, 0)

      // Send initial request. This should reach the origin
      await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          'cache-control': 'no-cache'
        }
      })
      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(revalidationRequests, 0)

      // Send second request, a validation request should be sent
      await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          'cache-control': 'no-cache'
        }
      })
      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(revalidationRequests, 1)

      // Send third request w/o no-cache, this should be handled by the cache
      await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/'
      })
      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(revalidationRequests, 1)
    })

    test('no-store', async (t) => {
      const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
        res.setHeader('cache-control', 'public, s-maxage=100')
        res.end('asd')
      }).listen(0)

      const store = new MemoryCacheStore()
      store.createWriteStream = () => {
        t.assert.fail('shouln\'t have reached this')
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

    test('only-if-cached', async (t) => {
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
      t.assert.strictEqual(requestsToOrigin, 1)

      // Send second request, this shouldn't reach the origin
      await client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: {
          'cache-control': 'only-if-cached'
        }
      })
      t.assert.strictEqual(requestsToOrigin, 1)

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
        t.assert.strictEqual(res.statusCode, 504)
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
        t.assert.strictEqual(res.statusCode, 504)
      }
    })

    test('stale-if-error', async (t) => {
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

      t.assert.strictEqual(requestsToOrigin, 0)

      // Send first request. This will hit the origin and succeed
      {
        const response = await client.request({
          origin: 'localhost',
          path: '/',
          method: 'GET'
        })
        t.assert.strictEqual(requestsToOrigin, 1)
        t.assert.strictEqual(response.statusCode, 200)
        t.assert.strictEqual(await response.body.text(), 'asd')
      }

      // Send second request. It isn't stale yet, so this should be from the
      //  cache and succeed
      {
        const response = await client.request({
          origin: 'localhost',
          path: '/',
          method: 'GET'
        })
        t.assert.strictEqual(requestsToOrigin, 1)
        t.assert.strictEqual(response.statusCode, 200)
        t.assert.strictEqual(await response.body.text(), 'asd')
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
        t.assert.strictEqual(response.statusCode, 200)
        t.assert.strictEqual(await response.body.text(), 'asd')
      }

      // Wait for background revalidation to complete (which will fail with 500)
      await sleep(100)
      t.assert.strictEqual(requestsToOrigin, 2)

      // Send a fourth request. Still within stale-while-revalidate but without stale-if-error,
      // should return stale since previous revalidation failed and stale-if-error applies
      {
        const response = await client.request({
          origin: 'localhost',
          path: '/',
          method: 'GET'
        })
        t.assert.strictEqual(response.statusCode, 200)
        t.assert.strictEqual(await response.body.text(), 'asd')
      }

      // Wait for another background revalidation
      await sleep(100)
      t.assert.strictEqual(requestsToOrigin, 3)

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
        t.assert.strictEqual(requestsToOrigin, 4)
        t.assert.strictEqual(response.statusCode, 500)
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
    test(`caches ${code} response with cache headers`, async (t) => {
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

      t.assert.strictEqual(requestsToOrigin, 0)

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      // First request should hit the origin
      {
        const res = await client.request(request)
        t.assert.strictEqual(requestsToOrigin, 1)
        t.assert.strictEqual(res.statusCode, code)
        t.assert.strictEqual(await res.body.text(), body)
      }

      // Second request should be served from cache
      {
        const res = await client.request(request)
        t.assert.strictEqual(requestsToOrigin, 1) // Should still be 1 (cached)
        t.assert.strictEqual(res.statusCode, code)
        t.assert.strictEqual(await res.body.text(), body)
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
    test(`does not cache non-heuristically cacheable status ${code} without explicit directive`, async (t) => {
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

      t.assert.strictEqual(requestsToOrigin, 0)

      const request = {
        origin: 'localhost',
        method: 'GET',
        path: '/'
      }

      // First request should hit the origin
      {
        const res = await client.request(request)
        t.assert.strictEqual(requestsToOrigin, 1)
        t.assert.strictEqual(res.statusCode, code)
        t.assert.strictEqual(await res.body.text(), body)
      }

      // Second request should also hit the origin (not cached)
      {
        const res = await client.request(request)
        t.assert.strictEqual(requestsToOrigin, 2) // Should be 2 (not cached)
        t.assert.strictEqual(res.statusCode, code)
        t.assert.strictEqual(await res.body.text(), body)
      }
    })
  }

  test('discriminates caching of range requests, or does not cache them', async (t) => {
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

    t.assert.strictEqual(requestsToOrigin, 0)

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
      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(res.statusCode, code)
      t.assert.strictEqual(await res.body.text(), body)
    }

    // Second request with different range should hit the origin too
    request.headers.range = 'bytes=5-'
    {
      const res = await client.request(request)
      t.assert.strictEqual(requestsToOrigin, 2)
      t.assert.strictEqual(res.statusCode, code)
      t.assert.strictEqual(await res.body.text(), body)
    }
  })

  test('discriminates caching of conditionnal requests (if-none-match), or does not cache them', async (t) => {
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

    t.assert.strictEqual(requestsToOrigin, 0)

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
      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(res.statusCode, code)
      t.assert.strictEqual(await res.body.text(), body)
    }

    // Second request with different etag should hit the origin too
    request.headers['if-none-match'] = 'another-etag'
    {
      const res = await client.request(request)
      t.assert.strictEqual(requestsToOrigin, 2)
      t.assert.strictEqual(res.statusCode, code)
      t.assert.strictEqual(await res.body.text(), body)
    }
  })

  test('discriminates caching of conditionnal requests (if-modified-since), or does not cache them', async (t) => {
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

    t.assert.strictEqual(requestsToOrigin, 0)

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
      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(res.statusCode, code)
      t.assert.strictEqual(await res.body.text(), body)
    }

    // Second request with different since should hit the origin too
    request.headers['if-modified-since'] = new Date(0).toUTCString()
    {
      const res = await client.request(request)
      t.assert.strictEqual(requestsToOrigin, 2)
      t.assert.strictEqual(res.statusCode, code)
      t.assert.strictEqual(await res.body.text(), body)
    }
  })

  test('stale-while-revalidate returns stale immediately and revalidates in background (RFC 5861)', async (t) => {
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
      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await res.body.text(), 'original-response')
    }

    // Wait for response to become stale
    await sleep(1100)

    // Request stale content - should return immediately with stale content
    const startTime = Date.now()
    {
      const res = await client.request(request)
      const responseTime = Date.now() - startTime

      // Should return stale content immediately (< 50ms)
      t.assert.strictEqual(res.statusCode, 200)
      t.assert.strictEqual(await res.body.text(), 'original-response')
      t.assert.strictEqual(requestsToOrigin, 1) // No additional origin requests yet

      // Response should be immediate (RFC 5861 requirement)
      if (responseTime > 100) {
        t.assert.fail(`stale-while-revalidate response took ${responseTime}ms, should be < 100ms`)
      }
    }

    // Wait for background revalidation to complete
    await sleep(500)

    // Verify that revalidation occurred in background
    t.assert.strictEqual(revalidationRequests, 1, 'Background revalidation should have occurred')
  })

  test('stale-while-revalidate updates cache after background revalidation', async (t) => {
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
      t.assert.strictEqual(requestsToOrigin, 1)
      t.assert.strictEqual(await res.body.text(), 'original-response')
    }

    // Wait for staleness
    await sleep(1100)

    // First stale request - gets stale content immediately
    {
      const res = await client.request(request)
      t.assert.strictEqual(await res.body.text(), 'original-response')
    }

    // Wait for background revalidation
    await sleep(500)
    t.assert.strictEqual(revalidationRequests, 1)

    // Second stale request - should get updated content from cache
    // (still within stale-while-revalidate window)
    {
      const res = await client.request(request)
      t.assert.strictEqual(await res.body.text(), 'updated-response')
      t.assert.strictEqual(requestsToOrigin, 1) // Still only one origin request
    }
  })
})
