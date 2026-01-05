'use strict'

const { test, describe, before, after } = require('node:test')
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

describe('content-encoding chain limit', () => {
  // CVE fix: Limit the number of content-encodings to prevent resource exhaustion
  // Similar to urllib3 (GHSA-gm62-xv2j-4w53) and curl (CVE-2022-32206)
  const MAX_CONTENT_ENCODINGS = 5

  let server
  before(async () => {
    server = createServer({
      noDelay: true
    }, (req, res) => {
      const encodingCount = parseInt(req.headers['x-encoding-count'] || '1', 10)
      const encodings = Array(encodingCount).fill('identity').join(', ')

      res.writeHead(200, {
        'Content-Encoding': encodings,
        'Content-Type': 'text/plain'
      })
      res.end('test')
    })
    await once(server.listen(0), 'listening')
  })

  after(() => {
    server.close()
  })

  test(`should allow exactly ${MAX_CONTENT_ENCODINGS} content-encodings`, async (t) => {
    const response = await fetch(`http://localhost:${server.address().port}`, {
      keepalive: false,
      headers: { 'x-encoding-count': String(MAX_CONTENT_ENCODINGS) }
    })

    assert.strictEqual(response.status, 200)
    // identity encoding is a no-op, so the body should be passed through
    assert.strictEqual(await response.text(), 'test')
  })

  test(`should reject more than ${MAX_CONTENT_ENCODINGS} content-encodings`, async (t) => {
    await assert.rejects(
      fetch(`http://localhost:${server.address().port}`, {
        keepalive: false,
        headers: { 'x-encoding-count': String(MAX_CONTENT_ENCODINGS + 1) }
      }),
      (err) => {
        assert.ok(err.cause?.message.includes('content-encoding'))
        return true
      }
    )
  })

  test('should reject excessive content-encoding chains', async (t) => {
    await assert.rejects(
      fetch(`http://localhost:${server.address().port}`, {
        keepalive: false,
        headers: { 'x-encoding-count': '100' }
      }),
      (err) => {
        assert.ok(err.cause?.message.includes('content-encoding'))
        return true
      }
    )
  })
})
