'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { fetch } = require('../..')
const { createBrotliCompress, createGzip, createDeflate } = require('node:zlib')
const { closeServerAsPromise } = require('../utils/node-http')

test('content-encoding header is case-iNsENsITIve', async (t) => {
  const contentCodings = 'GZiP, bR'
  const text = 'Hello, World!'

  const server = createServer((req, res) => {
    const gzip = createGzip()
    const brotli = createBrotliCompress()

    res.setHeader('Content-Encoding', contentCodings)
    res.setHeader('Content-Type', 'text/plain')

    gzip.pipe(brotli).pipe(res)

    gzip.write(text)
    gzip.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const response = await fetch(`http://localhost:${server.address().port}`)

  assert.strictEqual(await response.text(), text)
  assert.strictEqual(response.headers.get('content-encoding'), contentCodings)
})

test('response decompression according to content-encoding should be handled in a correct order', async (t) => {
  const contentCodings = 'deflate, gzip'
  const text = 'Hello, World!'

  const server = createServer((req, res) => {
    const gzip = createGzip()
    const deflate = createDeflate()

    res.setHeader('Content-Encoding', contentCodings)
    res.setHeader('Content-Type', 'text/plain')

    deflate.pipe(gzip).pipe(res)

    deflate.write(text)
    deflate.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const response = await fetch(`http://localhost:${server.address().port}`)

  assert.strictEqual(await response.text(), text)
})
