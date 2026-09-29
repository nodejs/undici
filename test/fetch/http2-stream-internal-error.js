'use strict'

const assert = require('node:assert')
const { createServer, constants } = require('node:http2')
const { once } = require('node:events')
const { test } = require('node:test')

const { Agent, fetch } = require('../..')

test('fetch rejects when an HTTP/2 stream is reset with NGHTTP2_INTERNAL_ERROR', { timeout: 5000 }, async (t) => {
  const server = createServer()
  server.on('stream', (stream) => {
    stream.on('error', () => {})
    stream.close(constants.NGHTTP2_INTERNAL_ERROR)
  })

  server.listen(0)
  await once(server, 'listening')

  const dispatcher = new Agent({ useH2c: true })
  t.after(async () => {
    await dispatcher.destroy()
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
  })

  await assert.rejects(
    fetch(`http://localhost:${server.address().port}/`, { dispatcher }),
    (err) => {
      assert.strictEqual(err.name, 'TypeError')
      assert.strictEqual(err.cause?.code, 'ERR_HTTP2_STREAM_ERROR')
      assert.strictEqual(err.cause?.http2ErrorCode, constants.NGHTTP2_INTERNAL_ERROR)
      return true
    }
  )
})
