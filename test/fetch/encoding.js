'use strict'

const { once } = require('node:events')
const { createServer } = require('node:http')
const { test, before, after, describe } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const { fetch } = require('../..')

describe('content-encoding handling', () => {
  const gzipDeflateText = Buffer.from('H4sIAAAAAAAAA6uY89nj7MmT1wM5zuuf8gxkYZCfx5IFACQ8u/wVAAAA', 'base64')
  const zstdText = Buffer.from('KLUv/QBYaQAASGVsbG8sIFdvcmxkIQ==', 'base64')

  let server
  before(async () => {
    server = createServer((req, res) => {
      if (req.headers['accept-encoding'].toLowerCase() === 'deflate, gzip') {
        res.writeHead(200,
          {
            'Content-Encoding': 'deflate, gzip',
            'Content-Type': 'text/plain'
          }
        )
          .end(gzipDeflateText)
      } else if (req.headers['accept-encoding'] === 'zstd') {
        res.writeHead(200,
          {
            'Content-Encoding': 'zstd',
            'Content-Type': 'text/plain'
          }
        )
          .end(zstdText)
      } else {
        res.writeHead(200,
          {
            'Content-Type': 'text/plain'
          }
        )
          .end('Hello, World!')
      }
    })
    await once(server.listen(0), 'listening')
  })

  after(() => {
    server.close()
  })

  test('content-encoding header', async (t) => {
    const { strictEqual } = tspl(t, { plan: 3 })

    const response = await fetch(`http://localhost:${server.address().port}`, {
      headers: { 'accept-encoding': 'deflate, gzip' }
    })

    strictEqual(response.headers.get('content-encoding'), 'deflate, gzip')
    strictEqual(response.headers.get('content-type'), 'text/plain')
    strictEqual(await response.text(), 'Hello, World!')

    await t.completed
  })

  test('content-encoding header is case-iNsENsITIve', async (t) => {
    const { strictEqual } = tspl(t, { plan: 3 })

    const response = await fetch(`http://localhost:${server.address().port}`, {
      headers: { 'accept-encoding': 'DeFlAtE, GzIp' }
    })

    strictEqual(response.headers.get('content-encoding'), 'deflate, gzip')
    strictEqual(response.headers.get('content-type'), 'text/plain')
    strictEqual(await response.text(), 'Hello, World!')

    await t.completed
  })

  test('should decompress zstandard response',
    { skip: typeof require('node:zlib').createZstdDecompress !== 'function' },
    async (t) => {
      const { strictEqual } = tspl(t, { plan: 3 })

      const response = await fetch(`http://localhost:${server.address().port}`, {
        headers: { 'accept-encoding': 'zstd' }
      })

      strictEqual(response.headers.get('content-encoding'), 'zstd')
      strictEqual(response.headers.get('content-type'), 'text/plain')
      strictEqual(await response.text(), 'Hello, World!')

      await t.completed
    })
})
