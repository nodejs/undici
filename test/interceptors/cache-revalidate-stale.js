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

describe('if-modified-since value on revalidation requests (RFC 9110 §13.1.3)', () => {
  const LAST_MODIFIED = 'Sat, 09 Oct 2010 14:28:02 GMT'

  test('sends the stored last-modified value verbatim', async () => {
    const clock = FakeTimers.install({
      now: new Date('2028-03-15T12:00:00.000Z').getTime()
    })
    after(() => clock.uninstall())

    const revalidationRequests = []
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.sendDate = false
      res.setHeader('Date', new Date(clock.now).toUTCString())
      res.setHeader('Cache-Control', 'public, max-age=1')
      res.setHeader('Last-Modified', LAST_MODIFIED)

      if (req.headers['if-modified-since']) {
        revalidationRequests.push(req.headers['if-modified-since'])
        res.statusCode = 304
        res.end()
      } else {
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

    // initial request, cache the response
    {
      const res = await request(url, { dispatcher })
      strictEqual(await res.body.text(), 'hello world')
    }

    // let the response go stale, forcing a revalidation request
    clock.tick(1500)

    {
      const res = await request(url, { dispatcher })
      strictEqual(await res.body.text(), 'hello world')
    }

    strictEqual(revalidationRequests.length, 1)
    strictEqual(revalidationRequests[0], LAST_MODIFIED)
  })

  test('sends the stored last-modified value verbatim during stale-while-revalidate', async () => {
    const clock = FakeTimers.install({
      now: new Date('2028-03-15T12:00:00.000Z').getTime()
    })
    after(() => clock.uninstall())

    const revalidationRequests = []
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.sendDate = false
      res.setHeader('Date', new Date(clock.now).toUTCString())
      res.setHeader('Cache-Control', 'public, max-age=1, stale-while-revalidate=3600')
      res.setHeader('Last-Modified', LAST_MODIFIED)

      if (req.headers['if-modified-since']) {
        revalidationRequests.push(req.headers['if-modified-since'])
        res.statusCode = 304
        res.end()
      } else {
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

    // initial request, cache the response
    {
      const res = await request(url, { dispatcher })
      strictEqual(await res.body.text(), 'hello world')
    }

    // within the stale-while-revalidate window, revalidated in the background
    clock.tick(2000)

    {
      const res = await request(url, { dispatcher })
      strictEqual(await res.body.text(), 'hello world')

      // wait for the background revalidation to complete
      await setTimeout(100)
      clock.tick(10)
      await setTimeout(100)
    }

    strictEqual(revalidationRequests.length, 1)
    strictEqual(revalidationRequests[0], LAST_MODIFIED)
  })

  test('falls back to the stored date value when there is no last-modified', async () => {
    const clock = FakeTimers.install({
      now: new Date('2028-03-15T12:00:00.000Z').getTime()
    })
    after(() => clock.uninstall())

    // date header trailing the local clock, as with a skewed origin clock
    const dateHeader = new Date(clock.now - 5000).toUTCString()

    const revalidationRequests = []
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.sendDate = false
      res.setHeader('Date', dateHeader)
      res.setHeader('Cache-Control', 'public, max-age=10')

      if (req.headers['if-modified-since']) {
        revalidationRequests.push(req.headers['if-modified-since'])
        res.statusCode = 304
        res.end()
      } else {
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

    // initial request, cache the response
    {
      const res = await request(url, { dispatcher })
      strictEqual(await res.body.text(), 'hello world')
    }

    // let the response go stale (staleAt is based off of the date header)
    clock.tick(6000)

    {
      const res = await request(url, { dispatcher })
      strictEqual(await res.body.text(), 'hello world')
    }

    strictEqual(revalidationRequests.length, 1)
    strictEqual(revalidationRequests[0], dateHeader)
  })
})
