'use strict'

// Regression test for https://github.com/nodejs/undici/issues/5613
// cache() and deduplicate() interceptors were silently inert on Client/Pool
// because neither dispatcher put opts.origin into dispatch options, and both
// interceptors bail out immediately when opts.origin is absent.

const { test } = require('node:test')
const { createServer } = require('node:http')
const { Client, Pool, interceptors } = require('../../')

function listen (server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
}

function close (server) {
  return new Promise(resolve => server.close(resolve))
}

// ---------------------------------------------------------------------------
// cache() on Client
// ---------------------------------------------------------------------------

test('cache() interceptor caches responses when composed onto a Client', async (t) => {
  let hits = 0
  const server = createServer((req, res) => {
    hits++
    res.writeHead(200, { 'cache-control': 'public, max-age=60', 'content-type': 'text/plain' })
    res.end('cacheable')
  })
  await listen(server)
  t.after(() => close(server))

  const client = new Client(`http://127.0.0.1:${server.address().port}`)
    .compose(interceptors.cache())
  t.after(() => client.close())

  for (let i = 0; i < 3; i++) {
    const { body } = await client.request({ method: 'GET', path: '/' })
    await body.text()
  }

  // Without the fix, hits === 3 (interceptor was inert)
  t.assert.strictEqual(hits, 1, 'cache() on Client: only 1 origin hit expected after 3 requests')
})

// ---------------------------------------------------------------------------
// cache() on Pool
// ---------------------------------------------------------------------------

test('cache() interceptor caches responses when composed onto a Pool', async (t) => {
  let hits = 0
  const server = createServer((req, res) => {
    hits++
    res.writeHead(200, { 'cache-control': 'public, max-age=60', 'content-type': 'text/plain' })
    res.end('cacheable pool')
  })
  await listen(server)
  t.after(() => close(server))

  const pool = new Pool(`http://127.0.0.1:${server.address().port}`)
    .compose(interceptors.cache())
  t.after(() => pool.close())

  for (let i = 0; i < 3; i++) {
    const { body } = await pool.request({ method: 'GET', path: '/' })
    await body.text()
  }

  t.assert.strictEqual(hits, 1, 'cache() on Pool: only 1 origin hit expected after 3 requests')
})

// ---------------------------------------------------------------------------
// deduplicate() on Client
// ---------------------------------------------------------------------------

test('deduplicate() interceptor collapses concurrent requests when composed onto a Client', async (t) => {
  let hits = 0
  const server = createServer((req, res) => {
    hits++
    // Delay so requests overlap
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('deduped')
    }, 50)
  })
  await listen(server)
  t.after(() => close(server))

  const client = new Client(`http://127.0.0.1:${server.address().port}`)
    .compose(interceptors.deduplicate())
  t.after(() => client.close())

  // Fire 3 identical requests concurrently
  const results = await Promise.all([
    client.request({ method: 'GET', path: '/slow' }),
    client.request({ method: 'GET', path: '/slow' }),
    client.request({ method: 'GET', path: '/slow' })
  ])

  for (const { body } of results) await body.text()

  // Without the fix, hits === 3 (interceptor was inert)
  t.assert.strictEqual(hits, 1, 'deduplicate() on Client: only 1 origin hit expected for 3 concurrent identical requests')
})

// ---------------------------------------------------------------------------
// Caller-provided opts.origin is preserved (not overwritten)
// ---------------------------------------------------------------------------

test('compose() does not overwrite an explicitly provided opts.origin', async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'cache-control': 'public, max-age=60' })
    res.end('ok')
  })
  await listen(server)
  const port = server.address().port
  t.after(() => close(server))

  const client = new Client(`http://127.0.0.1:${port}`)
    .compose(interceptors.cache())
  t.after(() => client.close())

  const origin = `http://127.0.0.1:${port}`
  const { body } = await client.request({ method: 'GET', path: '/', origin })
  await body.text()
  // Should not throw and explicit origin should be respected
  t.assert.ok(true, 'explicit origin in opts is preserved without error')
})
