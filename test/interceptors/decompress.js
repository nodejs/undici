'use strict'

const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { createGzip, createDeflate, createBrotliCompress } = require('node:zlib')
const { tspl } = require('@matteo.collina/tspl')

const { Client } = require('../..')
const createDecompressInterceptor = require('../../lib/interceptor/decompress')

test('should decompress gzip response', async t => {
  t = tspl(t, { plan: 3 })

  const data = 'This is a test message for gzip compression validation.'
  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    const gzip = createGzip()
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'gzip'
    })

    gzip.pipe(res)
    gzip.end(data)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(createDecompressInterceptor())

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  const body = await response.body.text()

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-encoding'], undefined)
  t.equal(body, data)

  await t.completed
})

test('should decompress deflate response', async t => {
  t = tspl(t, { plan: 3 })

  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    const deflate = createDeflate()
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'deflate'
    })

    const data = 'This message is compressed with deflate algorithm!'
    deflate.pipe(res)
    deflate.end(data)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(createDecompressInterceptor())

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  const body = await response.body.text()

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-encoding'], undefined)
  t.equal(body, 'This message is compressed with deflate algorithm!')

  await t.completed
})

test('should decompress brotli response', async t => {
  t = tspl(t, { plan: 3 })

  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    const brotli = createBrotliCompress()
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'br'
    })

    const data = 'This message is compressed with brotli compression!'
    brotli.pipe(res)
    brotli.end(data)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(createDecompressInterceptor())

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  const body = await response.body.text()

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-encoding'], undefined)
  t.equal(body, 'This message is compressed with brotli compression!')

  await t.completed
})

test('should pass through uncompressed response', async t => {
  t = tspl(t, { plan: 3 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/plain'
    })
    res.end('This is uncompressed data')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(createDecompressInterceptor())

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  const body = await response.body.text()

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-type'], 'text/plain')
  t.equal(body, 'This is uncompressed data')

  await t.completed
})

test('should pass through unsupported encoding', async t => {
  t = tspl(t, { plan: 3 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'unsupported'
    })
    res.end('This has unsupported encoding')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(createDecompressInterceptor())

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  const body = await response.body.text()

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-encoding'], 'unsupported')
  t.equal(body, 'This has unsupported encoding')

  await t.completed
})

test('should pass through error responses (4xx, 5xx)', async t => {
  t = tspl(t, { plan: 3 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    const gzip = createGzip()
    res.writeHead(404, {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'gzip'
    })

    const data = 'Not found error message'
    gzip.pipe(res)
    gzip.end(data)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(createDecompressInterceptor())

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  const body = await response.body.text()

  t.equal(response.statusCode, 404)
  t.equal(response.headers['content-encoding'], 'gzip')
  t.notEqual(body, 'Not found error message')

  await t.completed
})

test('should pass through 204 No Content responses', async t => {
  t = tspl(t, { plan: 2 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(204, {
      'Content-Encoding': 'gzip'
    })
    res.end()
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(createDecompressInterceptor())

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  t.equal(response.statusCode, 204)
  t.equal(response.headers['content-encoding'], 'gzip')

  await t.completed
})

test('should pass through 304 Not Modified responses', async t => {
  t = tspl(t, { plan: 2 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(304, {
      'Content-Encoding': 'gzip'
    })
    res.end()
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(createDecompressInterceptor())

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  t.equal(response.statusCode, 304)
  t.equal(response.headers['content-encoding'], 'gzip')

  await t.completed
})

test('should handle large compressed responses', async t => {
  t = tspl(t, { plan: 3 })

  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    const gzip = createGzip()
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'gzip'
    })

    const largeData = 'A'.repeat(10000) + 'B'.repeat(10000) + 'C'.repeat(10000)
    gzip.pipe(res)
    gzip.end(largeData)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(createDecompressInterceptor())

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  const body = await response.body.text()

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-encoding'], undefined)
  t.equal(body.length, 30000)

  await t.completed
})

test('should handle case-insensitive content-encoding', async t => {
  t = tspl(t, { plan: 3 })

  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    const gzip = createGzip()
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'GZIP' // Uppercase
    })

    const data = 'Case insensitive test'
    gzip.pipe(res)
    gzip.end(data)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(createDecompressInterceptor())

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  const body = await response.body.text()

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-encoding'], undefined)
  t.equal(body, 'Case insensitive test')

  await t.completed
})

test('should remove content-length header when decompressing', async t => {
  t = tspl(t, { plan: 3 })

  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    const gzip = createGzip()
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'gzip'
    })

    const data = 'Test data'
    gzip.pipe(res)
    gzip.end(data)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(createDecompressInterceptor())

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  const body = await response.body.text()

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-length'], undefined)
  t.equal(body, 'Test data')

  await t.completed
})
