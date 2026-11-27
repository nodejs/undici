'use strict'

const assert = require('node:assert')
const { test, after } = require('node:test')
const { constants, createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

// On Node versions that do not surface premature resets as stream errors,
// RST_STREAM(CANCEL) before the response is reported as a bare 'close':
//
//   RST NO_ERROR        -> 'end', 'close'
//   RST PROTOCOL_ERROR  -> 'error', 'close'
//   RST INTERNAL_ERROR  -> 'error', 'close'
//   RST REFUSED_STREAM  -> 'error', 'close'
//   RST CANCEL          -> 'close'          <- nothing to act on
//
// CANCEL is the code Node uses when a stream is destroyed locally, so an
// incoming one is treated as a plain teardown rather than an error. Destroying
// the stream also unenrolls its timeout, so no 'timeout' follows either.
//
// completeRequestStream() therefore reached finalizeRequest() with no response
// delivered and no error reported, freeing the queue slot without ever calling
// request.onResponseError(): the caller's promise never settled, whatever
// headersTimeout and bodyTimeout were set to. Proxies send this upstream
// whenever their own downstream client goes away.

test('a stream cancelled before the response settles the request', async () => {
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('stream', (stream) => {
    stream.on('error', () => {})
    setTimeout(() => {
      try {
        stream.close(constants.NGHTTP2_CANCEL)
      } catch {}
    }, 30)
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: { rejectUnauthorized: false },
    allowH2: true,
    // Long enough that only a real completion can settle this in time.
    headersTimeout: 30000,
    bodyTimeout: 30000
  })
  after(() => client.destroy())

  let timer
  const outcome = await Promise.race([
    client.request({ path: '/', method: 'GET' }).then(() => 'resolved', (err) => err.code),
    new Promise((resolve) => { timer = setTimeout(() => resolve('never settled'), 5000) })
  ]).finally(() => clearTimeout(timer))

  assert.ok(outcome === 'UND_ERR_INFO' || outcome === 'ERR_HTTP2_STREAM_ABORTED',
    `a cancelled stream must reject its request, got ${outcome}`)
})

test('a stream cancelled after the response headers settles the response body', async () => {
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('stream', (stream) => {
    stream.on('error', () => {})
    stream.respond({ ':status': 200 })
    setTimeout(() => {
      try {
        stream.close(constants.NGHTTP2_CANCEL)
      } catch {}
    }, 30)
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: { rejectUnauthorized: false },
    allowH2: true,
    headersTimeout: 30000,
    bodyTimeout: 30000
  })
  after(() => client.destroy())

  const res = await client.request({ path: '/', method: 'GET' })
  assert.strictEqual(res.statusCode, 200)
  let body
  try {
    body = await res.body.text()
  } catch (err) {
    assert.strictEqual(err.code, 'ERR_HTTP2_STREAM_ABORTED')
    assert.strictEqual(err.http2ErrorCode, constants.NGHTTP2_CANCEL)
    return
  }
  assert.strictEqual(body, '')
})
