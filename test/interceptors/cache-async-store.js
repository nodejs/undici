'use strict'

const { test, after, describe } = require('node:test')
const { strictEqual, notStrictEqual } = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { Readable } = require('node:stream')
const { request, Client, interceptors } = require('../../index')
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
