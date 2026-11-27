'use strict'

const assert = require('node:assert')
const { createServer, createSecureServer, constants } = require('node:http2')
const { once } = require('node:events')
const { test } = require('node:test')

const pem = require('@metcoder95/https-pem')

const { Agent, Client, fetch } = require('../..')

const { closeClientAndServerAsPromise } = require('../utils/node-http')

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

test('fetch rejects when a TLS HTTP/2 stream is reset with NGHTTP2_INTERNAL_ERROR', { timeout: 5000 }, async (t) => {
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  server.on('stream', (stream) => {
    stream.on('error', () => {})
    stream.close(constants.NGHTTP2_INTERNAL_ERROR)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
  t.after(closeClientAndServerAsPromise(client, server))

  await assert.rejects(
    fetch(`https://localhost:${server.address().port}/`, { dispatcher: client }),
    (err) => {
      assert.strictEqual(err.name, 'TypeError')
      assert.strictEqual(err.cause?.code, 'ERR_HTTP2_STREAM_ERROR')
      assert.strictEqual(err.cause?.http2ErrorCode, constants.NGHTTP2_INTERNAL_ERROR)
      return true
    }
  )
})
