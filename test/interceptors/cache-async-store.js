'use strict'

const { test, after, describe } = require('node:test')
const { strictEqual, notStrictEqual } = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { Readable } = require('node:stream')
const { request, Client, Dispatcher, interceptors } = require('../../index')
const MemoryCacheStore = require('../../lib/cache/memory-cache-store')
const FakeTimers = require('@sinonjs/fake-timers')
const { setTimeout } = require('node:timers/promises')

/**
 * Wraps a MemoryCacheStore to simulate an async remote store:
 * - get() always returns a Promise
 * - body is returned as a Readable stream instead of an array
 */
class AsyncCacheStore {
  #inner

  constructor () {
    this.#inner = new MemoryCacheStore()
  }

  async get (key) {
    const result = this.#inner.get(key)
    if (!result) return undefined

    const { body, ...rest } = result
    const readable = new Readable({ read () {} })
    if (body) {
      for (const chunk of body) {
        readable.push(chunk)
      }
    }
    readable.push(null)

    return { ...rest, body: readable }
  }

  createWriteStream (key, value) {
    return this.#inner.createWriteStream(key, value)
  }

  delete (key) {
    return this.#inner.delete(key)
  }
}

describe('cache interceptor with async store', () => {
  // Delivers start, data and end synchronously inside dispatch(), so an
  // empty 304 ends before an async store lookup settles.
  class SyncDispatcher extends Dispatcher {
    requests = 0

    dispatch (opts, handler) {
      this.requests++
      const controller = {
        paused: false,
        aborted: false,
        reason: null,
        pause () {},
        resume () {},
        abort () {}
      }
      handler.onRequestStart?.(controller, {})
      if (opts.headers?.['if-none-match'] === '"abc"') {
        // Without cache-control the 304 is passed through untouched.
        handler.onResponseStart?.(controller, 304, { etag: '"abc"', 'cache-control': 'public, max-age=60' }, 'Not Modified')
        handler.onResponseEnd?.(controller, {})
        return true
      }
      const body = Buffer.from('cached body')
      handler.onResponseStart?.(controller, 200, {
        'cache-control': 'public, max-age=60',
        etag: '"abc"',
        'content-length': String(body.length)
      }, 'OK')
      handler.onResponseData?.(controller, body)
      handler.onResponseEnd?.(controller, {})
      return true
    }
  }

  test('a 304 to a conditional request that missed the cache reaches the client intact', async () => {
    const store = new AsyncCacheStore()
    const client = new SyncDispatcher().compose(interceptors.cache({ store }))

    const response = await client.request({
      origin: 'http://localhost',
      method: 'GET',
      path: '/',
      headers: { 'if-none-match': '"abc"' }
    })
    strictEqual(response.statusCode, 304)
    strictEqual(await response.body.text(), '')
  })

  // Misses on the interceptor's lookup and hits on the lookup CacheHandler
  // makes after the 304, so handle304 runs with a cached value to replay.
  class MissThenHitStore {
    #inner = new MemoryCacheStore()
    #asStream
    misses = 0

    constructor ({ asStream = false } = {}) {
      this.#asStream = asStream
    }

    async get (key) {
      if (this.misses > 0) {
        this.misses--
        return undefined
      }
      const result = this.#inner.get(key)
      if (!result || !this.#asStream) return result
      const { body, ...rest } = result
      return { ...rest, body: Readable.from(body ?? []) }
    }

    createWriteStream (key, value) {
      return this.#inner.createWriteStream(key, value)
    }

    delete (key) {
      return this.#inner.delete(key)
    }
  }

  for (const [name, asStream] of [['an array of Buffers', false], ['a Readable', true]]) {
    test(`a 304 resolved against an async store replays a cached body that is ${name} before the end`, async () => {
      const store = new MissThenHitStore({ asStream })
      const dispatcher = new SyncDispatcher()
      const client = dispatcher.compose(interceptors.cache({ store }))

      {
        const response = await client.request({ origin: 'http://localhost', method: 'GET', path: '/' })
        strictEqual(response.statusCode, 200)
        strictEqual(await response.body.text(), 'cached body')
      }

      // The origin's 304 goes downstream, followed by the cached body, then the end.
      store.misses = 1
      {
        const response = await client.request({
          origin: 'http://localhost',
          method: 'GET',
          path: '/',
          headers: { 'if-none-match': '"abc"' }
        })
        strictEqual(response.statusCode, 304)
        strictEqual(await response.body.text(), 'cached body')
      }
      strictEqual(dispatcher.requests, 2)
    })
  }

  test('stale-while-revalidate 304 refreshes cache with async store', async () => {
    const clock = FakeTimers.install({ now: 1 })
    after(() => clock.uninstall())

    let count200 = 0
    let count304 = 0

    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.sendDate = false
      res.setHeader('Date', new Date(clock.now).toUTCString())
      res.setHeader('Cache-Control', 'public, max-age=10, stale-while-revalidate=3600')
      res.setHeader('ETag', '"test-etag"')

      if (req.headers['if-none-match']) {
        count304++
        res.statusCode = 304
        res.end()
      } else {
        res.end('hello world ' + count200++)
      }
    })

    server.listen(0)
    await once(server, 'listening')

    const store = new AsyncCacheStore()
    const dispatcher = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache({ store }))

    after(async () => {
      server.close()
      await dispatcher.close()
    })

    const url = `http://localhost:${server.address().port}`

    // First request, populates cache
    {
      const res = await request(url, { dispatcher })
      strictEqual(await res.body.text(), 'hello world 0')
      strictEqual(res.statusCode, 200)
      strictEqual(res.headers.warning, undefined)
    }

    // Advance past max-age into stale-while-revalidate window
    clock.tick(12000)

    // Second request: stale, triggers background 304 revalidation
    {
      const res = await request(url, { dispatcher })
      strictEqual(await res.body.text(), 'hello world 0')
      strictEqual(res.statusCode, 200)
      strictEqual(res.headers.warning, '110 - "response is stale"')
      await setTimeout(100)
    }

    // Third request: should be fresh after 304 revalidation
    {
      clock.tick(10)
      const res = await request(url, { dispatcher })
      strictEqual(await res.body.text(), 'hello world 0')
      strictEqual(res.statusCode, 200)
      strictEqual(res.headers.warning, undefined)
    }

    strictEqual(count200, 1)
    strictEqual(count304, 1)
  })

  test('synchronous 304 revalidation refetches when Vary adds a request header', async () => {
    const clock = FakeTimers.install({ now: 1, toFake: ['Date'] })
    let count200 = 0
    let count304 = 0

    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.sendDate = false
      res.setHeader('date', new Date(clock.now).toUTCString())

      if (req.headers['if-none-match']) {
        count304++
        res.statusCode = 304
        res.setHeader('vary', 'x-variant')
        res.end()
        return
      }

      count200++
      res.setHeader('cache-control', `public, max-age=${count200 === 1 ? 10 : 60}`)
      res.setHeader('etag', `"response-${count200}"`)

      if (count200 === 1) {
        res.end('cached')
      } else {
        res.setHeader('vary', 'x-variant')
        res.end(`variant ${req.headers['x-variant']}`)
      }
    })

    server.listen(0)
    await once(server, 'listening')

    const store = new AsyncCacheStore()
    const dispatcher = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache({ store }))
    const url = `http://localhost:${server.address().port}`
    const makeRequest = variant => request(url, {
      dispatcher,
      headers: {
        'x-variant': variant
      }
    })

    try {
      {
        const res = await makeRequest('a')
        strictEqual(await res.body.text(), 'cached')
      }

      clock.tick(12000)

      {
        const res = await makeRequest('b')
        strictEqual(await res.body.text(), 'variant b')
        strictEqual(count304, 1)
        strictEqual(count200, 2)
      }

      {
        const res = await makeRequest('c')
        strictEqual(await res.body.text(), 'variant c')
        strictEqual(count200, 3)
      }

      {
        const res = await makeRequest('b')
        strictEqual(await res.body.text(), 'variant b')
        strictEqual(count200, 3)
      }
    } finally {
      await dispatcher.close()
      await new Promise(resolve => server.close(resolve))
      clock.uninstall()
    }
  })

  test('stale-while-revalidate 200 refreshes cache with async store', async () => {
    const clock = FakeTimers.install({ now: 1 })
    after(() => clock.uninstall())

    let requestCount = 0

    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.sendDate = false
      res.setHeader('Date', new Date(clock.now).toUTCString())
      res.setHeader('Cache-Control', 'public, max-age=10, stale-while-revalidate=3600')
      res.setHeader('ETag', `"etag-${requestCount}"`)
      res.end('hello world ' + requestCount++)
    })

    server.listen(0)
    await once(server, 'listening')

    const store = new AsyncCacheStore()
    const dispatcher = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache({ store }))

    after(async () => {
      server.close()
      await dispatcher.close()
    })

    const url = `http://localhost:${server.address().port}`

    // First request
    {
      const res = await request(url, { dispatcher })
      strictEqual(await res.body.text(), 'hello world 0')
    }

    // Advance past max-age
    clock.tick(12000)

    // Stale response, triggers background 200 revalidation
    {
      const res = await request(url, { dispatcher })
      strictEqual(await res.body.text(), 'hello world 0')
      strictEqual(res.headers.warning, '110 - "response is stale"')
      await setTimeout(100)
    }

    // Should be fresh with new content
    {
      clock.tick(10)
      const res = await request(url, { dispatcher })
      strictEqual(await res.body.text(), 'hello world 1')
      strictEqual(res.headers.warning, undefined)
    }
  })

  test('null vary values are not sent in revalidation headers', async () => {
    const clock = FakeTimers.install({ now: 1 })
    after(() => clock.uninstall())

    let revalidationHeaders = null

    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.sendDate = false
      res.setHeader('Date', new Date(clock.now).toUTCString())
      res.setHeader('Cache-Control', 'public, max-age=10, stale-while-revalidate=3600')
      res.setHeader('ETag', '"test-etag"')
      res.setHeader('Vary', 'X-Custom-Header, X-Another-Header')

      if (req.headers['if-none-match']) {
        revalidationHeaders = { ...req.headers }
        res.statusCode = 304
        res.end()
      } else {
        res.end('hello world')
      }
    })

    server.listen(0)
    await once(server, 'listening')

    const store = new AsyncCacheStore()
    const dispatcher = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache({ store }))

    after(async () => {
      server.close()
      await dispatcher.close()
    })

    const url = `http://localhost:${server.address().port}`

    // First request without X-Custom-Header or X-Another-Header
    // These will be stored as null in the vary record
    {
      const res = await request(url, { dispatcher })
      strictEqual(await res.body.text(), 'hello world')
    }

    // Advance past max-age
    clock.tick(12000)

    // Trigger stale-while-revalidate
    {
      const res = await request(url, { dispatcher })
      strictEqual(res.headers.warning, '110 - "response is stale"')
      await setTimeout(100)
    }

    // Verify the revalidation request did NOT include null vary headers
    notStrictEqual(revalidationHeaders, null)
    strictEqual(revalidationHeaders['x-custom-header'], undefined)
    strictEqual(revalidationHeaders['x-another-header'], undefined)
    strictEqual(revalidationHeaders['if-none-match'], '"test-etag"')
  })
})
