'use strict'

const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const { fetch } = require('../..')

test('content-encoding header', async (t) => {
  const { strictEqual } = tspl(t, { plan: 2 })

  const contentEncoding = 'deflate, gzip'
  const text = 'Hello, World!'
  const gzipDeflateText = Buffer.from('H4sIAAAAAAAAA6uY89nj7MmT1wM5zuuf8gxkYZCfx5IFACQ8u/wVAAAA', 'base64')

  const server = createServer((req, res) => {
    res.writeHead(200,
      {
        'Content-Encoding': contentEncoding,
        'Content-Type': 'text/plain'
      }
    )
      .end(gzipDeflateText)
  })
  await once(server.listen(0), 'listening')

  const response = await fetch(`http://localhost:${server.address().port}`)

  strictEqual(response.headers.get('content-encoding'), contentEncoding)
  strictEqual(await response.text(), text)

  await t.completed
  server.close()
})

test('content-encoding header is case-iNsENsITIve', async (t) => {
  const { strictEqual } = tspl(t, { plan: 2 })

  const contentEncoding = 'DeFlAtE, GzIp'
  const text = 'Hello, World!'
  const gzipDeflateText = Buffer.from('H4sIAAAAAAAAA6uY89nj7MmT1wM5zuuf8gxkYZCfx5IFACQ8u/wVAAAA', 'base64')

  const server = createServer((req, res) => {
    res.writeHead(200,
      {
        'Content-Encoding': contentEncoding,
        'Content-Type': 'text/plain'
      }
    )
      .end(gzipDeflateText)
  })

  await once(server.listen(0), 'listening')

  const response = await fetch(`http://localhost:${server.address().port}`)

  strictEqual(response.headers.get('content-encoding'), contentEncoding)
  strictEqual(await response.text(), text)

  await t.completed
  server.close()
})

test('should decompress zstandard response',
  { skip: typeof require('node:zlib').createZstdDecompress !== 'function' },
  async (t) => {
    const { strictEqual } = tspl(t, { plan: 3 })

    const contentEncoding = 'zstd'
    const text = 'Hello, World!'
    const zstdText = Buffer.from('KLUv/QBYaQAASGVsbG8sIFdvcmxkIQ==', 'base64')

    const server = createServer((req, res) => {
      res.writeHead(200,
        {
          'Content-Encoding': contentEncoding,
          'Content-Type': 'text/plain'
        })
        .end(zstdText)
    })

    await once(server.listen(0), 'listening')

    const url = `http://localhost:${server.address().port}`

    const response = await fetch(url)
    strictEqual(await response.text(), text)
    strictEqual(response.headers.get('content-encoding'), contentEncoding)
    strictEqual(response.headers.get('content-type'), 'text/plain')

    await t.completed
    server.close()
  })
