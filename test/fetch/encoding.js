'use strict'

const { test } = require('tap')
const { createServer } = require('http')
const { once } = require('events')
const { fetch } = require('../..')
const { createBrotliCompress, createGzip } = require('zlib')

test('content-encoding header is case-iNsENsITIve', async (t) => {
  const contentCodings = 'GZiP, bR'
  const text = 'Hello, World!'

  const server = createServer((req, res) => {
    const gzip = createGzip()
    const brotli = createBrotliCompress()

    res.setHeader('Content-Encoding', contentCodings)
    res.setHeader('Content-Type', 'text/plain')

    brotli.pipe(gzip).pipe(res)

    brotli.write(text)
    brotli.end()
  }).listen(0)

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  const response = await fetch(`http://localhost:${server.address().port}`)

  t.equal(await response.text(), text)
  t.equal(response.headers.get('content-encoding'), contentCodings)
})
