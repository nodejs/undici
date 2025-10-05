'use strict'

const { once } = require('node:events')
const { createServer } = require('node:http')
const { test, before, after, describe } = require('node:test')
const { fetch } = require('../..')

describe('content-encoding handling', () => {
  const gzipDeflateText = Buffer.from('H4sIAAAAAAAAA6uY89nj7MmT1wM5zuuf8gxkYZCfx5IFACQ8u/wVAAAA', 'base64')
  const zstdText = Buffer.from('KLUv/QBYaQAASGVsbG8sIFdvcmxkIQ==', 'base64')

  let server
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
  })

  after(() => {
    server.close()
  })

  test('content-encoding header', async (t) => {
    const response = await fetch(`http://localhost:${server.address().port}`, {
      keepalive: false,
      headers: { 'accept-encoding': 'deflate, gzip' }
    })

    t.assert.strictEqual(response.headers.get('content-encoding'), 'deflate, gzip')
    t.assert.strictEqual(response.headers.get('content-type'), 'text/plain')
    t.assert.strictEqual(await response.text(), 'Hello, World!')
  })

  test('content-encoding header is case-iNsENsITIve', async (t) => {
    const response = await fetch(`http://localhost:${server.address().port}`, {
      keepalive: false,
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
        keepalive: false,
        headers: { 'accept-encoding': 'zstd' }
      })

      t.assert.strictEqual(response.headers.get('content-encoding'), 'zstd')
      t.assert.strictEqual(response.headers.get('content-type'), 'text/plain')
      t.assert.strictEqual(await response.text(), 'Hello, World!')
    })
})
