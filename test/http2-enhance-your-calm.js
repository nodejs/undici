'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer, constants } = require('node:http2')
const { once } = require('node:events')
const { Client, Pool } = require('..')

// A stream reset with ENHANCE_YOUR_CALM is a session-level signal that the
// session (or the peer's view of it) is running out of memory (RFC 9113
// section 7). When node:http2 cannot add response headers because the session's
// maxSessionMemory budget is exhausted, it resets the stream with this code but
// leaves the session open. undici must not keep using that session: every
// later request on it fails the same way.
// See https://github.com/nodejs/undici/issues/6149.

function createMemoryOffendingServer (code = constants.NGHTTP2_ENHANCE_YOUR_CALM) {
  const server = createServer()
  let sessions = 0
  server.on('session', (session) => {
    sessions++
    session.on('error', () => {})
  })
  server.on('stream', (stream, headers) => {
    stream.on('error', () => {})
    if (headers[':path'] === '/reset') {
      stream.close(code)
    } else {
      stream.respond({ ':status': 200 })
      stream.end('ok')
    }
  })
  server.sessionCount = () => sessions
  return server
}

test('an ENHANCE_YOUR_CALM stream reset retires the session', async (t) => {
  const server = createMemoryOffendingServer()
  server.listen(0)
  await once(server, 'listening')
  t.after(() => server.close())

  const origin = `http://localhost:${server.address().port}`
  const client = new Client(origin, { useH2c: true, connections: 1 })
  t.after(() => client.destroy())

  // Warm up so a session exists.
  let res = await client.request({ path: '/ok', method: 'GET' })
  assert.strictEqual(res.statusCode, 200)
  await res.body.dump()
  assert.strictEqual(server.sessionCount(), 1)

  // A stream reset with ENHANCE_YOUR_CALM fails the request.
  await assert.rejects(
    client.request({ path: '/reset', method: 'GET' }),
    { code: 'ERR_HTTP2_STREAM_ERROR' }
  )

  // The poisoned session is retired, so the next request reconnects on a fresh
  // session instead of reusing it and failing the same way.
  res = await client.request({ path: '/ok', method: 'GET' })
  assert.strictEqual(res.statusCode, 200)
  await res.body.dump()

  assert.strictEqual(server.sessionCount(), 2, 'the session was not retired after ENHANCE_YOUR_CALM')
})

test('an INTERNAL_ERROR stream reset retires the session', async (t) => {
  const server = createMemoryOffendingServer(constants.NGHTTP2_INTERNAL_ERROR)
  server.listen(0)
  await once(server, 'listening')
  t.after(() => server.close())

  const origin = `http://localhost:${server.address().port}`
  const client = new Client(origin, { useH2c: true, connections: 1 })
  t.after(() => client.destroy())

  let res = await client.request({ path: '/ok', method: 'GET' })
  assert.strictEqual(res.statusCode, 200)
  await res.body.dump()
  assert.strictEqual(server.sessionCount(), 1)

  await assert.rejects(
    client.request({ path: '/reset', method: 'GET' }),
    { code: 'ERR_HTTP2_STREAM_ERROR' }
  )

  res = await client.request({ path: '/ok', method: 'GET' })
  assert.strictEqual(res.statusCode, 200)
  await res.body.dump()

  assert.strictEqual(server.sessionCount(), 2)
})

test('a Pool recovers after an ENHANCE_YOUR_CALM stream reset', async (t) => {
  const server = createMemoryOffendingServer()
  server.listen(0)
  await once(server, 'listening')
  t.after(() => server.close())

  const origin = `http://localhost:${server.address().port}`
  const pool = new Pool(origin, { useH2c: true, connections: 1 })
  t.after(() => pool.destroy())

  let res = await pool.request({ path: '/ok', method: 'GET' })
  assert.strictEqual(res.statusCode, 200)
  await res.body.dump()

  await assert.rejects(
    pool.request({ path: '/reset', method: 'GET' }),
    { code: 'ERR_HTTP2_STREAM_ERROR' }
  )

  res = await pool.request({ path: '/ok', method: 'GET' })
  assert.strictEqual(res.statusCode, 200)
  await res.body.dump()

  assert.strictEqual(server.sessionCount(), 2)
})

test('a burst after an ENHANCE_YOUR_CALM reset reconnects instead of reusing the session', async (t) => {
  const server = createMemoryOffendingServer()
  server.listen(0)
  await once(server, 'listening')
  t.after(() => server.close())

  const origin = `http://localhost:${server.address().port}`
  const client = new Client(origin, { useH2c: true, connections: 1 })
  t.after(() => client.destroy())

  const res = await client.request({ path: '/ok', method: 'GET' })
  await res.body.dump()

  await assert.rejects(
    client.request({ path: '/reset', method: 'GET' }),
    { code: 'ERR_HTTP2_STREAM_ERROR' }
  )

  // Several requests queued right after the reset must all be served, on the
  // fresh session.
  const results = await Promise.all(Array.from({ length: 4 }, () => client.request({ path: '/ok', method: 'GET' })))
  for (const r of results) {
    assert.strictEqual(r.statusCode, 200)
    await r.body.dump()
  }

  assert.strictEqual(server.sessionCount(), 2)
})
