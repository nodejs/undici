'use strict'

const { test, after } = require('node:test')
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

test('revalidates the request, handles 304s during stale-while-revalidate', async () => {
  function isStale (res) {
    return res.headers.warning === '110 - "response is stale"'
  }

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
    res.setHeader('ETag', '"xxx"')

    // revalidation response.
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
})
