'use strict'

// Regression test for https://github.com/nodejs/undici/issues/3492
//
// fetch previously had no way to opt into the RetryHandler infrastructure
// that undici has shipped for direct Dispatcher consumers since v5.28. The
// `init.retry` option exposes that infrastructure to fetch callers:
//
//   fetch(url, { retry: true })             // RetryHandler defaults
//   fetch(url, { retry: { maxRetries: 5 } }) // forwarded to RetryHandler
//   fetch(url, { retry: false })            // explicit opt-out
//   fetch(url)                              // historical behaviour
//
// Tests are deterministic (counting server hits) rather than relying on
// the exact closed-connection timing from the original repro, which varies
// across Node versions. The original race-recovery case lives in its own
// test so it does not block the suite when Node itself has fixed the race.

const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const assert = require('node:assert')

const { fetch, Request, Agent } = require('../..')
const { closeServerAsPromise } = require('../utils/node-http')

test('fetch(url) without init.retry does not retry on 5xx (preserves historical behaviour)', async () => {
  let hits = 0
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    hits++
    res.statusCode = 500
    res.end('busy')
  })
  after(closeServerAsPromise(server))

  server.listen(0)
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}`

  const res = await fetch(url)
  assert.strictEqual(res.status, 500)
  assert.strictEqual(hits, 1, 'default fetch must not retry')
})

test('fetch(url, { retry: true }) opts into RetryHandler defaults', async () => {
  let hits = 0
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    hits++
    res.statusCode = 500
    res.end('busy')
  })
  after(closeServerAsPromise(server))

  server.listen(0)
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}`

  // RetryHandler defaults include status 500 and maxRetries 5.
  // After retries are exhausted it throws UND_ERR_REQ_RETRY — the correctness
  // signal here is that the server was hit more than once.
  await assert.rejects(fetch(url, { retry: true }), (err) => {
    assert.strictEqual(err.cause?.code, 'UND_ERR_REQ_RETRY')
    return true
  })
  assert.ok(hits > 1, `retry: true must retry; server was hit ${hits} times`)
})

test('fetch init.retry forwards maxRetries verbatim to RetryHandler', async () => {
  let hits = 0
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    hits++
    res.statusCode = 500
    res.end('busy')
  })
  after(closeServerAsPromise(server))

  server.listen(0)
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}`

  await assert.rejects(
    fetch(url, {
      retry: {
        maxRetries: 2,
        minTimeout: 1,
        maxTimeout: 10,
        timeoutFactor: 1
      }
    }),
    (err) => {
      assert.strictEqual(err.cause?.code, 'UND_ERR_REQ_RETRY')
      return true
    }
  )
  assert.strictEqual(hits, 3, '1 initial + 2 retries = 3 server hits')
})

test('fetch init.retry = false explicitly disables retry', async () => {
  let hits = 0
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    hits++
    res.statusCode = 500
    res.end('busy')
  })
  after(closeServerAsPromise(server))

  server.listen(0)
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}`

  const res = await fetch(url, { retry: false })
  assert.strictEqual(res.status, 500)
  assert.strictEqual(hits, 1, 'retry: false must not retry even if default changes')
})

test('fetch init.retry respects custom statusCodes override', async () => {
  let hits = 0
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    hits++
    res.statusCode = 500 // not in our custom allowlist below
    res.end('busy')
  })
  after(closeServerAsPromise(server))

  server.listen(0)
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}`

  // User says "only retry 503, not 500" — the 500 must surface as a response
  // without being retried.
  const res = await fetch(url, {
    retry: {
      maxRetries: 3,
      minTimeout: 1,
      maxTimeout: 10,
      timeoutFactor: 1,
      statusCodes: [503]
    }
  })
  assert.strictEqual(res.status, 500)
  assert.strictEqual(hits, 1, 'statusCodes override honoured — no retry')
})

test('Request constructor accepts retry and fetch(req) picks it up', async () => {
  let hits = 0
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    hits++
    res.statusCode = 500
    res.end('busy')
  })
  after(closeServerAsPromise(server))

  server.listen(0)
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}`

  const req = new Request(url, {
    retry: { maxRetries: 1, minTimeout: 1, maxTimeout: 10, timeoutFactor: 1 }
  })
  await assert.rejects(fetch(req), (err) => {
    assert.strictEqual(err.cause?.code, 'UND_ERR_REQ_RETRY')
    return true
  })
  assert.strictEqual(hits, 2, 'Request-level retry: 1 initial + 1 retry')
})

test('Request.clone() preserves the retry option', async () => {
  let hits = 0
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    hits++
    res.statusCode = 500
    res.end('busy')
  })
  after(closeServerAsPromise(server))

  server.listen(0)
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}`

  const req = new Request(url, {
    retry: { maxRetries: 1, minTimeout: 1, maxTimeout: 10, timeoutFactor: 1 }
  })
  const clone = req.clone()
  await assert.rejects(fetch(clone), (err) => {
    assert.strictEqual(err.cause?.code, 'UND_ERR_REQ_RETRY')
    return true
  })
  assert.strictEqual(hits, 2, 'clone must inherit retry: 1 initial + 1 retry')
})

test('fetch init.retry wraps a user-provided dispatcher instead of the global one', async () => {
  let hits = 0
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    hits++
    res.statusCode = 500
    res.end('busy')
  })
  after(closeServerAsPromise(server))

  server.listen(0)
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}`

  // Custom dispatcher — if the retry wrap swallowed it, no requests would
  // reach the server at all (dispatchers are not interchangeable with the
  // global one for arbitrary origins). Server hits > 0 proves wrap composed.
  const dispatcher = new Agent({ keepAliveTimeout: 1 })
  after(() => dispatcher.destroy())

  await assert.rejects(
    fetch(url, {
      dispatcher,
      retry: { maxRetries: 1, minTimeout: 1, maxTimeout: 10, timeoutFactor: 1 }
    }),
    (err) => {
      assert.strictEqual(err.cause?.code, 'UND_ERR_REQ_RETRY')
      return true
    }
  )
  assert.strictEqual(hits, 2, 'custom dispatcher reached + retry applied on top')
})
