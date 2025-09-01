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
  const gzipBrotliText = Buffer.from('CxCAH4sIAAAAAAAAA/NIzcnJ11EIzy/KSVEEANDDSuwNAAAAAw==', 'base64')

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('Content-Encoding', contentCodings)
    res.setHeader('Content-Type', 'text/plain')
    res.write(gzipBrotliText)
    res.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const response = await fetch(`http://localhost:${server.address().port}`)

  assert.strictEqual(await response.text(), text)
  assert.strictEqual(response.headers.get('content-encoding'), contentCodings)

  await t.completed
})

test('response decompression according to content-encoding should be handled in a correct order', async (t) => {
  const contentCodings = 'deflate, gzip'
  const text = 'Hello, World!'
  const gzipDeflateText = Buffer.from('H4sIAAAAAAAAA6uY89nj7MmT1wM5zuuf8gxkYZCfx5IFACQ8u/wVAAAA', 'base64')

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('Content-Encoding', contentCodings)
    res.setHeader('Content-Type', 'text/plain')
    res.write(gzipDeflateText)
    res.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const response = await fetch(`http://localhost:${server.address().port}`)

  assert.strictEqual(await response.text(), text)

  await t.completed
})

test('should decompress zstandard response',
  { skip: typeof zlib.createZstdDecompress !== 'function' },
  async (t) => {
    const contentCodings = 'zstd'
    const text = 'Hello, World!'
    const zstdText = Buffer.from('KLUv/QBYaQAASGVsbG8sIFdvcmxkIQ==', 'base64')

    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.setHeader('Content-Encoding', contentCodings)
      res.setHeader('Content-Type', 'text/plain')
      res.write(zstdText)
      res.end()
    }
    ).listen(0)
    t.after(closeServerAsPromise(server))

    await once(server, 'listening')
    const url = `http://localhost:${server.address().port}`

    const response = await fetch(url)
    assert.strictEqual(await response.text(), text)
    assert.strictEqual(response.headers.get('content-encoding'), contentCodings)
    assert.strictEqual(response.headers.get('content-type'), 'text/plain')

    await t.completed
  })
