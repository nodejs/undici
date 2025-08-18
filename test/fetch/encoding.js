'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { fetch } = require('../..')
const zlib = require('node:zlib')
const { closeServerAsPromise } = require('../utils/node-http')

test('content-encoding header is case-iNsENsITIve', async (t) => {
  const contentCodings = 'GZiP, bR'
  const text = 'Hello, World!'

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    const gzip = zlib.createGzip()
    const brotli = zlib.createBrotliCompress()

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

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    const gzip = zlib.createGzip()
    const deflate = zlib.createDeflate()

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

test('should decompress zstandard response',
  { skip: typeof zlib.createZstdDecompress !== 'function' },
  async (t) => {
    const contentCodings = 'zstd'
    const text = 'Hello, World!'
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      const zstd = zlib.createZstdCompress()

      res.setHeader('Content-Encoding', contentCodings)
      res.setHeader('Content-Type', 'text/plain')

      zstd.pipe(res)
      zstd.write(text)
      zstd.end()
    }
    ).listen(0)
    t.after(closeServerAsPromise(server))

    await once(server, 'listening')
    const url = `http://localhost:${server.address().port}`

    const response = await fetch(url)
    assert.strictEqual(await response.text(), text)
    assert.strictEqual(response.headers.get('content-encoding'), contentCodings)
    assert.strictEqual(response.headers.get('content-type'), 'text/plain')
  })
