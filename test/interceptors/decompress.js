'use strict'
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { tspl } = require('@matteo.collina/tspl')
const { createBrotliCompress, createGzip, createDeflate, createDeflateRaw } = require('node:zlib')
const { closeClientAndServerAsPromise } = require('../utils/node-http')

const { Client, interceptors } = require('../..')
const { PassThrough } = require('node:stream')
const { decompress } = interceptors

test('decompresses gzip encoding', async (t) => {
  t = tspl(t, { plan: 1 })
  const contentEncodings = 'gzip'
  const text = 'Hello, World!'

  const server = createServer((req, res) => {
    const gzip = createGzip()

    res.setHeader('Content-Encoding', contentEncodings)
    res.setHeader('Content-Type', 'text/plain')

    gzip.pipe(res)
    gzip.write(text)
    gzip.end()
  }).listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(decompress())

  after(closeClientAndServerAsPromise(client, server))

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  t.equal(await response.body.text(), text)

  await t.completed
})

test('decompresses deflate encoding', async (t) => {
  t = tspl(t, { plan: 1 })
  const contentEncodings = 'deflate'
  const text = 'Hello, World!'

  const server = createServer((req, res) => {
    const deflate = createDeflate()

    res.setHeader('Content-Encoding', contentEncodings)
    res.setHeader('Content-Type', 'text/plain')

    deflate.pipe(res)
    deflate.write(text)
    deflate.end()
  }).listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(decompress())

  after(closeClientAndServerAsPromise(server, client))

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  t.equal(await response.body.text(), text)

  await t.completed
})

test('decompresses raw deflate encoding', async (t) => {
  t = tspl(t, { plan: 1 })
  const contentEncodings = 'deflate'
  const text = 'Hello, World!'

  const server = createServer((req, res) => {
    const deflate = createDeflateRaw()

    res.setHeader('Content-Encoding', contentEncodings)
    res.setHeader('Content-Type', 'text/plain')

    deflate.pipe(res)
    deflate.write(text)
    deflate.end()
  }).listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(decompress())

  after(closeClientAndServerAsPromise(server, client))

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  t.equal(await response.body.text(), text)

  await t.completed
})

test('decompresses brotli encoding', async (t) => {
  t = tspl(t, { plan: 1 })
  const contentEncodings = 'br'
  const text = 'Hello, World!'

  const server = createServer((req, res) => {
    const brotli = createBrotliCompress()

    res.setHeader('Content-Encoding', contentEncodings)
    res.setHeader('Content-Type', 'text/plain')

    brotli.pipe(res)
    brotli.write(text)
    brotli.end()
  }).listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(decompress())

  after(closeClientAndServerAsPromise(server, client))

  const response = await client.request({
    method: 'GET',
    path: '/'
  })
  t.equal(await response.body.text(), text)

  await t.completed
})

test('decompresses multiple encodings', async (t) => {
  t = tspl(t, { plan: 1 })
  const contentEncodings = 'gzip, br'
  const text = 'Hello, World!'

  const server = createServer((req, res) => {
    const gzip = createGzip()
    const brotli = createBrotliCompress()

    res.setHeader('Content-Encoding', contentEncodings)
    res.setHeader('Content-Type', 'text/plain')

    brotli.pipe(gzip).pipe(res)

    brotli.write(text)
    brotli.end()
  }).listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(decompress())

  after(closeClientAndServerAsPromise(server, client))

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  t.equal(await response.body.text(), text)

  await t.completed
})

test('content-encoding header is case-iNsENsITIve', async (t) => {
  t = tspl(t, { plan: 1 })
  const contentCodings = 'GZiP, Br'
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

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(decompress())

  after(closeClientAndServerAsPromise(server, client))

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  t.equal(await response.body.text(), text)

  await t.completed
})

test('does not throw when an unknown content encoding is received in the response', async (t) => {
  t = tspl(t, { plan: 1 })
  const contentCodings = 'UNSUPPORTED'
  const text = 'Hello, World!'

  const server = createServer((req, res) => {
    res.setHeader('Content-Encoding', contentCodings)
    res.setHeader('Content-Type', 'text/plain')
    res.write(text)
    res.end()
  }).listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(decompress())

  after(closeClientAndServerAsPromise(server, client))

  const response = await client.request({
    method: 'GET',
    path: '/'
  }
  )
  t.equal(await response.body.text(), text)

  await t.completed
})

test('response decompression according to content-encoding should be handled in a correct order', async (t) => {
  t = tspl(t, { plan: 1 })
  const contentCodings = 'deflate, gzip'
  const text = 'Hello, World!'

  const server = createServer((req, res) => {
    const gzip = createGzip()
    const deflate = createDeflate()

    res.setHeader('Content-Encoding', contentCodings)
    res.setHeader('Content-Type', 'text/plain')

    gzip.pipe(deflate).pipe(res)

    gzip.write(text)
    gzip.end()
  }).listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(decompress())

  after(closeClientAndServerAsPromise(server, client))

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  t.equal(await response.body.text(), text)

  await t.completed
})

test('handles backpressure', async (t) => {
  t = tspl(t, { plan: 1 })
  const contentCodings = 'deflate, gzip'

  const text = Buffer.alloc(1e6).toString()

  const server = createServer((req, res) => {
    const gzip = createGzip()
    const deflate = createDeflate()

    res.setHeader('Content-Encoding', contentCodings)
    res.setHeader('Content-Type', 'text/plain')

    gzip.pipe(deflate).pipe(res)

    gzip.write(text)
    gzip.end()
  }).listen(0)

  await once(server, 'listening')

  const dst = new PassThrough()

  dst.on('data', () => {
    dst.pause()
    setImmediate(() => dst.resume())
  }).on('end', () => {
    t.ok(true, 'pass')
  })

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(decompress())

  after(closeClientAndServerAsPromise(server, client))

  await client.dispatch({
    method: 'GET',
    path: '/'
  },
  {
    onError: (err) => { throw err },
    onConnect: () => {},
    onBodySent: () => {},
    onHeaders: () => {},
    onComplete: () => dst.end(),
    onData: (chunk) => dst.write(chunk)
  })

  await t.completed
})
