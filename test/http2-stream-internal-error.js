'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { createServer, constants } = require('node:http2')
const { once } = require('node:events')
const { Agent } = require('..')

// A stream reset before the response headers arrive must settle the request
// promise rather than leave it pending. Streams closed with an explicit error
// code surface an ERR_HTTP2_STREAM_ERROR carrying that code, which is a
// different path from a plain stream.close().

test('request rejects when the stream is reset with NGHTTP2_INTERNAL_ERROR', async (t) => {
  const server = createServer()
  server.on('stream', (stream) => {
    // The server side emits 'error' for its own reset stream as well.
    stream.on('error', () => {})
    stream.close(constants.NGHTTP2_INTERNAL_ERROR)
  })
  server.listen(0)
  await once(server, 'listening')
  t.after(() => server.close())

  const origin = `http://localhost:${server.address().port}`
  const dispatcher = new Agent({ useH2c: true })
  t.after(() => dispatcher.close())

  await assert.rejects(
    dispatcher.request({ origin, path: '/', method: 'GET' }),
    (err) => {
      assert.strictEqual(err.code, 'ERR_HTTP2_STREAM_ERROR')
      assert.strictEqual(err.http2ErrorCode, constants.NGHTTP2_INTERNAL_ERROR)
      return true
    }
  )
})

test('a reset stream does not prevent other requests from completing', async (t) => {
  const server = createServer()
  server.on('stream', (stream, headers) => {
    stream.on('error', () => {})
    if (headers[':path'] === '/bad') {
      stream.close(constants.NGHTTP2_INTERNAL_ERROR)
    } else {
      stream.respond({ ':status': 200 })
      stream.end('ok')
    }
  })
  server.listen(0)
  await once(server, 'listening')
  t.after(() => server.close())

  const origin = `http://localhost:${server.address().port}`
  const dispatcher = new Agent({ connections: 1, useH2c: true })
  t.after(() => dispatcher.close())

  await assert.rejects(
    dispatcher.request({ origin, path: '/bad', method: 'GET' }),
    { code: 'ERR_HTTP2_STREAM_ERROR' }
  )

  const res = await dispatcher.request({ origin, path: '/good', method: 'GET' })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(await res.body.text(), 'ok')
})
