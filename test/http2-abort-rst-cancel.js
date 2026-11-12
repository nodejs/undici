'use strict'

const assert = require('node:assert')
const { test, after } = require('node:test')
const { constants, createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

// Aborting a request resets its stream with RST_STREAM(CANCEL), the code for a
// stream that is no longer needed. With the default NO_ERROR, Node defers the
// RST_STREAM until a still-queued request body has been written, and the
// synchronous destroy() in abort() means that never happens: the peer is never
// told the stream is gone.

test('aborting a request with a queued body resets the stream with CANCEL', async () => {
  // A zero initial window keeps the request body queued on the client.
  const server = createSecureServer({
    ...(await pem.generate({ opts: { keySize: 2048 } })),
    settings: { initialWindowSize: 0 }
  })

  const controller = new AbortController()
  const reset = new Promise((resolve) => {
    server.on('stream', (stream) => {
      stream.on('error', () => {})
      stream.on('close', () => resolve(stream.rstCode))
      controller.abort()
    })
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: { rejectUnauthorized: false },
    allowH2: true
  })
  after(() => client.destroy())

  const request = client.request({
    path: '/',
    method: 'POST',
    body: Buffer.alloc(32 * 1024),
    signal: controller.signal
  }).then(() => 'resolved', (err) => err.name)

  let timer
  const rstCode = await Promise.race([
    reset,
    new Promise((resolve) => { timer = setTimeout(() => resolve('no RST_STREAM'), 5000) })
  ]).finally(() => clearTimeout(timer))

  assert.strictEqual(rstCode, constants.NGHTTP2_CANCEL)
  assert.strictEqual(await request, 'AbortError')
})
