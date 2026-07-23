'use strict'

const { test, after, describe } = require('node:test')
const { strictEqual } = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { request, Client, interceptors } = require('../../index')
const FakeTimers = require('@sinonjs/fake-timers')
const { setTimeout } = require('node:timers/promises')

test('revalidates the request when the response is stale', async () => {
  const clock = FakeTimers.install({
    now: 1
  })
  after(() => clock.uninstall())

  let count = 0
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.sendDate = false
    res.setHeader('Date', new Date(clock.now).toUTCString())
    res.setHeader('Cache-Control', 'public, max-age=1')
    res.end('hello world ' + count++)
  })

  server.listen(0)
  await once(server, 'listening')

  const dispatcher = new Client(`http://localhost:${server.address().port}`)
    .compose(interceptors.cache())

  after(async () => {
    server.close()
    await dispatcher.close()
  })

  const url = `http://localhost:${server.address().port}`

  {
    const res = await request(url, { dispatcher })
    strictEqual(await res.body.text(), 'hello world 0')
  }

  clock.tick(999)

  {
    const res = await request(url, { dispatcher })
    strictEqual(await res.body.text(), 'hello world 0')
  }

  clock.tick(1)

  {
    const res = await request(url, { dispatcher })
    strictEqual(await res.body.text(), 'hello world 1')
  }

  clock.tick(999)

  {
    const res = await request(url, { dispatcher })
    strictEqual(await res.body.text(), 'hello world 1')
  }

  clock.tick(1)

  {
    const res = await request(url, { dispatcher })
    strictEqual(await res.body.text(), 'hello world 2')
  }
})

test('304 revalidation response updates the stored entry (RFC 9111 §4.3.4)', async () => {
  const clock = FakeTimers.install({
    now: 1000
  })
  after(() => clock.uninstall())

  let requestsToOrigin = 0
  let revalidationRequests = 0
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.sendDate = false
    res.setHeader('Date', new Date(clock.now).toUTCString())

    if (req.headers['if-none-match'] === '"asd"') {
      revalidationRequests++
      // Extend the response's freshness & update a header (RFC 9111 §4.3.4)
      res.statusCode = 304
      res.setHeader('Cache-Control', 'public, max-age=60')
      res.setHeader('X-Test-Header', 'updated')
      res.end()
    } else {
      requestsToOrigin++
      res.setHeader('Cache-Control', 'public, max-age=1')
      res.setHeader('ETag', '"asd"')
      res.setHeader('X-Test-Header', 'original')
      res.end('hello world')
    }
  })

  server.listen(0)
  await once(server, 'listening')

  const dispatcher = new Client(`http://localhost:${server.address().port}`)
    .compose(interceptors.cache())

  after(async () => {
    server.close()
    await dispatcher.close()
  })

  const url = `http://localhost:${server.address().port}`

  // Initial request, populates the cache
  {
    const res = await request(url, { dispatcher })
    strictEqual(await res.body.text(), 'hello world')
    strictEqual(requestsToOrigin, 1)
    strictEqual(revalidationRequests, 0)
  }

  clock.tick(1500)

  // Response is stale, revalidation gets a 304 carrying new headers. The
  //  served response was just validated: no stale warning, updated headers
  {
    const res = await request(url, { dispatcher })
    strictEqual(await res.body.text(), 'hello world')
    strictEqual(res.statusCode, 200)
    strictEqual(requestsToOrigin, 1)
    strictEqual(revalidationRequests, 1)
    strictEqual(res.headers.warning, undefined)
    strictEqual(res.headers['x-test-header'], 'updated')
    strictEqual(res.headers['cache-control'], 'public, max-age=60')
  }

  // Well past the original freshness lifetime but within the extended one,
  //  the updated entry must be served from cache without revalidating again
  clock.tick(30000)

  {
    const res = await request(url, { dispatcher })
    strictEqual(await res.body.text(), 'hello world')
    strictEqual(res.statusCode, 200)
    strictEqual(requestsToOrigin, 1)
    strictEqual(revalidationRequests, 1)
    strictEqual(res.headers.warning, undefined)
    strictEqual(res.headers['x-test-header'], 'updated')
  }
})

test('bare 304 revalidation response refreshes the stored entry', async () => {
  const clock = FakeTimers.install({
    now: 1000
  })
  after(() => clock.uninstall())

  let requestsToOrigin = 0
  let revalidationRequests = 0
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.sendDate = false
    res.setHeader('Date', new Date(clock.now).toUTCString())

    if (req.headers['if-none-match'] === '"asd"') {
      revalidationRequests++
      // 304 without any headers to merge, freshness is recomputed from the
      //  stored headers
      res.statusCode = 304
      res.end()
    } else {
      requestsToOrigin++
      res.setHeader('Cache-Control', 'public, max-age=1')
      res.setHeader('ETag', '"asd"')
      res.end('hello world')
    }
  })

  server.listen(0)
  await once(server, 'listening')

  const dispatcher = new Client(`http://localhost:${server.address().port}`)
    .compose(interceptors.cache())

  after(async () => {
    server.close()
    await dispatcher.close()
  })

  const url = `http://localhost:${server.address().port}`

  // Initial request, populates the cache
  {
    const res = await request(url, { dispatcher })
    strictEqual(await res.body.text(), 'hello world')
    strictEqual(requestsToOrigin, 1)
    strictEqual(revalidationRequests, 0)
  }

  clock.tick(1500)

  // Response is stale, revalidation gets a bare 304
  {
    const res = await request(url, { dispatcher })
    strictEqual(await res.body.text(), 'hello world')
    strictEqual(requestsToOrigin, 1)
    strictEqual(revalidationRequests, 1)
    strictEqual(res.headers.warning, undefined)
  }

  // The entry got a new freshness window from the stored max-age, this is
  //  served from cache instead of revalidating on every request
  clock.tick(400)

  {
    const res = await request(url, { dispatcher })
    strictEqual(await res.body.text(), 'hello world')
    strictEqual(requestsToOrigin, 1)
    strictEqual(revalidationRequests, 1)
  }

  // Stale again, revalidates again
  clock.tick(1500)

  {
    const res = await request(url, { dispatcher })
    strictEqual(await res.body.text(), 'hello world')
    strictEqual(requestsToOrigin, 1)
    strictEqual(revalidationRequests, 2)
  }
})

describe('revalidates the request, handles 304s during stale-while-revalidate', async () => {
  function isStale (res) {
    return res.headers.warning === '110 - "response is stale"'
  }

  async function revalidateTest (useEtag = false) {
    const clock = FakeTimers.install({
      now: 1
    })
    after(() => clock.uninstall())

    let count200 = 0
    let count304 = 0

    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.sendDate = false
      res.setHeader('Date', new Date(clock.now).toUTCString())
      res.setHeader('Cache-Control', 'public, max-age=10, stale-while-revalidate=3600')
      if (useEtag) {
        res.setHeader('ETag', '"xxx"')
      }

      // revalidation response.
      if (req.headers['if-none-match'] || req.headers['if-modified-since']) {
        count304++
        res.statusCode = 304
        res.end()
      } else {
        res.end('hello world ' + count200++)
      }
    })

    server.listen(0)
    await once(server, 'listening')

    const dispatcher = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await dispatcher.close()
    })

    const url = `http://localhost:${server.address().port}`

    // initial request, cache the response
    {
      const res = await request(url, { dispatcher })
      strictEqual(await res.body.text(), 'hello world 0')
      strictEqual(isStale(res), false)
      strictEqual(res.statusCode, 200)
    }

    // wait nearly a second, still fresh
    {
      clock.tick(900)
      const res = await request(url, { dispatcher })
      strictEqual(await res.body.text(), 'hello world 0')
      strictEqual(isStale(res), false)
      strictEqual(res.statusCode, 200)
    }

    // within stale-while-revalidate window, still return stale cached response, revalidate in background
    {
      clock.tick(12000)
      const res = await request(url, { dispatcher })
      strictEqual(await res.body.text(), 'hello world 0')
      strictEqual(isStale(res), true)
      strictEqual(res.statusCode, 200)
      await setTimeout(100) // wait for revalidation to be complete.
    }

    // should get revalidated content, not stale.
    {
      clock.tick(10)
      const res = await request(url, { dispatcher })
      strictEqual(await res.body.text(), 'hello world 0')
      strictEqual(isStale(res), false)
      strictEqual(res.statusCode, 200)
    }

    strictEqual(count200, 1)
    strictEqual(count304, 1)
  }

  test('using if-none-match', async () => await revalidateTest(true))
  test('using if-modified-since', async () => await revalidateTest(false))
})
