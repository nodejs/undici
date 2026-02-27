'use strict'

const { once } = require('node:events')
const { createServer } = require('node:http')
const { test, before, after, describe } = require('node:test')
const { fetch, Client } = require('../..')

describe('content-encoding handling', () => {
  const gzipDeflateText = Buffer.from('H4sIAAAAAAAAA6uY89nj7MmT1wM5zuuf8gxkYZCfx5IFACQ8u/wVAAAA', 'base64')
  const zstdText = Buffer.from('KLUv/QBYaQAASGVsbG8sIFdvcmxkIQ==', 'base64')

  let server
  let client
  before(async () => {
    server = createServer({
      noDelay: true
    }, (req, res) => {
      res.socket.setNoDelay(true)
      if (
        req.headers['accept-encoding'] === 'deflate, gzip' ||
        req.headers['accept-encoding'] === 'DeFlAtE, GzIp'
      ) {
        res.writeHead(200,
          {
            'Content-Encoding': 'deflate, gzip',
            'Content-Type': 'text/plain'
          }
        )
        res.flushHeaders()
        res.end(gzipDeflateText)
      } else if (req.headers['accept-encoding'] === 'zstd') {
        res.writeHead(200,
          {
            'Content-Encoding': 'zstd',
            'Content-Type': 'text/plain'
          }
        )
        res.flushHeaders()
        res.end(zstdText)
      } else {
        res.writeHead(200,
          {
            'Content-Type': 'text/plain'
          }
        )
        res.flushHeaders()
        res.end('Hello, World!')
      }
    })
    await once(server.listen(0), 'listening')
    client = new Client(`http://localhost:${server.address().port}`)
  })

  after(async () => {
    await client.close()
    server.closeAllConnections?.()
    server.close()
    await once(server, 'close')
  })

  test('content-encoding header', async (t) => {
    const response = await fetch(`http://localhost:${server.address().port}`, {
      dispatcher: client,
      headers: { 'accept-encoding': 'deflate, gzip' }
    })

    t.assert.strictEqual(response.headers.get('content-encoding'), 'deflate, gzip')
    t.assert.strictEqual(response.headers.get('content-type'), 'text/plain')
    t.assert.strictEqual(await response.text(), 'Hello, World!')
  })

  test('content-encoding header is case-iNsENsITIve', async (t) => {
    const response = await fetch(`http://localhost:${server.address().port}`, {
      dispatcher: client,
      headers: { 'accept-encoding': 'DeFlAtE, GzIp' }
    })

    t.assert.strictEqual(response.headers.get('content-encoding'), 'deflate, gzip')
    t.assert.strictEqual(response.headers.get('content-type'), 'text/plain')
    t.assert.strictEqual(await response.text(), 'Hello, World!')
  })

  test('should decompress zstandard response',
    { skip: typeof require('node:zlib').createZstdDecompress !== 'function' },
    async (t) => {
      const response = await fetch(`http://localhost:${server.address().port}`, {
        dispatcher: client,
        headers: { 'accept-encoding': 'zstd' }
      })

      t.assert.strictEqual(response.headers.get('content-encoding'), 'zstd')
      t.assert.strictEqual(response.headers.get('content-type'), 'text/plain')
      t.assert.strictEqual(await response.text(), 'Hello, World!')
    })
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
    server.closeAllConnections?.()
    server.close()
  })

  test(`should allow exactly ${MAX_CONTENT_ENCODINGS} content-encodings`, async (t) => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => client.close())

    const response = await fetch(`http://localhost:${server.address().port}`, {
      dispatcher: client,
      keepalive: false,
      headers: { 'x-encoding-count': String(MAX_CONTENT_ENCODINGS) }
    })

    t.assert.strictEqual(response.status, 200)
    // identity encoding is a no-op, so the body should be passed through
    t.assert.strictEqual(await response.text(), 'test')
  })

  test(`should reject more than ${MAX_CONTENT_ENCODINGS} content-encodings`, async (t) => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => client.close())

    await t.assert.rejects(
      fetch(`http://localhost:${server.address().port}`, {
        dispatcher: client,
        keepalive: false,
        headers: { 'x-encoding-count': String(MAX_CONTENT_ENCODINGS + 1) }
      }),
      (err) => {
        t.assert.ok(err.cause?.message.includes('content-encoding'))
        return true
      }
    )
  })

  test('should reject excessive content-encoding chains', async (t) => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => client.close())

    await t.assert.rejects(
      fetch(`http://localhost:${server.address().port}`, {
        dispatcher: client,
        keepalive: false,
        headers: { 'x-encoding-count': '100' }
      }),
      (err) => {
        t.assert.ok(err.cause?.message.includes('content-encoding'))
        return true
      }
    )
  })
})
