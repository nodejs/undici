'use strict'

const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { createGzip, createDeflate, createBrotliCompress, createZstdCompress, deflateSync, gzipSync } = require('node:zlib')
const { tspl } = require('@matteo.collina/tspl')

const { Client, errors, getGlobalDispatcher, setGlobalDispatcher, request, interceptors } = require('../..')
const createDecompressInterceptor = require('../../lib/interceptor/decompress')

const immediate = () => new Promise(resolve => setImmediate(resolve))

function createControlledDispatch (handler, options, { forwardAbort = true } = {}) {
  let sourceHandler
  let abortReason = null
  const events = []
  const state = {
    paused: false,
    aborted: false,
    pauseCalls: 0,
    resumeCalls: 0
  }
  const controller = {
    rawHeaders: ['Content-Encoding', 'gzip'],
    rawTrailers: null,
    pause () {
      state.paused = true
      state.pauseCalls++
      events.push('controller-pause')
    },
    resume () {
      state.paused = false
      state.resumeCalls++
      events.push('controller-resume')
    },
    abort (reason) {
      if (state.aborted) {
        return
      }
      state.aborted = true
      abortReason = reason
      if (forwardAbort) {
        sourceHandler.onResponseError(controller, reason)
      }
    },
    get paused () { return state.paused },
    get aborted () { return state.aborted },
    get reason () { return abortReason }
  }

  const dispatch = createDecompressInterceptor(options)((opts, wrappedHandler) => {
    sourceHandler = wrappedHandler
    return true
  })
  dispatch({ method: 'GET' }, handler)
  sourceHandler.onRequestStart(controller, {})

  return { controller, events, sourceHandler, state }
}

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

test('retry composed before decompress can rewrite rawHeaders', async t => {
  t = tspl(t, { plan: 2 })

  const data = 'ok'
  const compressed = gzipSync(data)
  const server = createServer({ joinDuplicateHeaders: true }, (_req, res) => {
    res.writeHead(200, {
      'content-encoding': 'gzip',
      'content-length': String(compressed.length)
    })
    res.end(compressed)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose([
    interceptors.retry({ maxRetries: 0 }),
    interceptors.decompress()
  ])

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/',
    headers: { 'accept-encoding': 'gzip' }
  })

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), data)

  await t.completed
})

test('should preserve trailers when decompressing response', async t => {
  const data = 'Response with trailers'
  const compressed = gzipSync(data)
  const server = createServer({ joinDuplicateHeaders: true }, (_req, res) => {
    res.writeHead(200, {
      'Content-Encoding': 'gzip',
      Trailer: 'X-Checksum'
    })
    res.addTrailers({ 'X-Checksum': 'verified' })
    res.end(compressed)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(interceptors.decompress())

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  t = tspl(t, { plan: 2 })

  const response = await client.request({
    method: 'GET',
    path: '/',
    headers: { TE: 'trailers' }
  })
  const body = await response.body.text()

  t.equal(body, data)
  t.deepEqual(response.trailers, { 'x-checksum': 'verified' })

  await t.completed
})

test('should preserve representation headers and empty body for HEAD responses', async t => {
  const compressedRepresentation = gzipSync('HEAD response representation')
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'gzip',
      'Content-Length': compressedRepresentation.length
    })
    res.end()
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(interceptors.decompress())

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  t = tspl(t, { plan: 4 })

  const response = await client.request({
    method: 'HEAD',
    path: '/'
  })
  const body = await response.body.text()

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-encoding'], 'gzip')
  t.equal(response.headers['content-length'], `${compressedRepresentation.length}`)
  t.equal(body, '')

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

test('should decompress zstd response', async t => {
  t = tspl(t, { plan: 3 })

  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    const zstd = createZstdCompress()
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'zstd'
    })

    const data = 'This message is compressed with zstd compression!'
    zstd.pipe(res)
    zstd.end(data)
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
  t.equal(body, 'This message is compressed with zstd compression!')

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

test('should allow decompressing 5xx responses when skipErrorResponses is false', async t => {
  t = tspl(t, { plan: 3 })

  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    const gzip = createGzip()
    res.writeHead(500, {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'gzip'
    })

    const data = 'Internal server error message'
    gzip.pipe(res)
    gzip.end(data)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(createDecompressInterceptor({ skipErrorResponses: false }))

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

  t.equal(response.statusCode, 500)
  t.equal(response.headers['content-encoding'], undefined) // Should be removed when decompressing
  t.equal(body, 'Internal server error message') // Should be decompressed

  await t.completed
})

test('should allow custom skipStatusCodes', async t => {
  t = tspl(t, { plan: 3 })

  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    const gzip = createGzip()
    res.writeHead(201, {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'gzip'
    })

    const data = 'Created response'
    gzip.pipe(res)
    gzip.end(data)
  })

  server.listen(0)
  await once(server, 'listening')

  // Skip decompression for 201 status codes
  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(createDecompressInterceptor({ skipStatusCodes: [201, 204, 304] }))

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

  t.equal(response.statusCode, 201)
  t.equal(response.headers['content-encoding'], 'gzip') // Should be preserved when skipping
  t.notEqual(body, 'Created response') // Should still be compressed

  await t.completed
})

test('should decompress multiple encodings in correct order', async t => {
  t = tspl(t, { plan: 4 })

  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    // First compress with gzip, then with deflate (gzip, deflate)
    const gzip = createGzip()
    const deflate = createDeflate()

    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'gzip, deflate', // Applied in this order
      Trailer: 'X-Checksum'
    })

    const data = 'Multiple encoding test message'

    // Pipe: data → gzip → deflate → response
    gzip.pipe(deflate)
    deflate.pipe(res)
    res.addTrailers({ 'X-Checksum': 'verified' })
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
    path: '/',
    headers: { TE: 'trailers' }
  })

  const body = await response.body.text()

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-encoding'], undefined) // Should be removed
  t.equal(body, 'Multiple encoding test message') // Should be fully decompressed
  t.deepEqual(response.trailers, { 'x-checksum': 'verified' })

  await t.completed
})

test('should handle legacy encoding names (x-gzip)', async t => {
  t = tspl(t, { plan: 3 })

  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    const gzip = createGzip()
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'x-gzip' // Legacy name
    })

    const data = 'Legacy encoding test'
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
  t.equal(response.headers['content-encoding'], undefined) // Should be removed
  t.equal(body, 'Legacy encoding test')

  await t.completed
})

test('should pass through responses with unsupported encoding in chain', async t => {
  t = tspl(t, { plan: 3 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'gzip, unsupported, deflate' // Contains unsupported encoding
    })
    res.end('This should pass through unchanged')
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
  t.equal(response.headers['content-encoding'], 'gzip, unsupported, deflate') // Should be preserved
  t.equal(body, 'This should pass through unchanged')

  await t.completed
})

test('should handle empty encoding values', async t => {
  t = tspl(t, { plan: 3 })

  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    const gzip = createGzip()
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'gzip, ' // Contains empty value at end
    })

    const data = 'Empty encoding value test'
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
  t.equal(body, 'Empty encoding value test')

  await t.completed
})

test('decompress backpressure pauses on the first decoded chunk', { timeout: 5000 }, async () => {
  const payload = Buffer.alloc(1024 * 1024, 0x61)
  const compressed = gzipSync(payload)
  assert(compressed.length < 16 * 1024)

  let responseController
  let endController
  let endTrailers
  let endCalls = 0
  let errorCalls = 0
  const chunks = []
  let firstDataResolve
  const firstData = new Promise(resolve => { firstDataResolve = resolve })
  let endResolve
  const ended = new Promise(resolve => { endResolve = resolve })

  const handler = {
    onRequestStart (controller) {
      responseController = controller
    },
    onResponseStart (controller) {
      assert.strictEqual(controller, responseController)
    },
    onResponseData (controller, chunk) {
      assert.strictEqual(controller, responseController)
      chunks.push(chunk)
      if (chunks.length === 1) {
        controller.pause()
        firstDataResolve()
      }
    },
    onResponseEnd (controller, trailers) {
      endController = controller
      endTrailers = trailers
      endCalls++
      endResolve()
    },
    onResponseError () {
      errorCalls++
      endResolve()
    }
  }

  const { controller, sourceHandler, state } = createControlledDispatch(handler)
  sourceHandler.onResponseStart(controller, 200, { 'content-encoding': 'gzip' }, 'OK')
  sourceHandler.onResponseData(controller, compressed)
  controller.rawTrailers = ['X-Trailer', 'raw-value']
  const trailers = { 'x-trailer': 'value' }
  sourceHandler.onResponseEnd(controller, trailers)

  await firstData
  await immediate()
  assert.equal(responseController.paused, true)
  assert.equal(state.pauseCalls, 1)
  assert.equal(chunks.length, 1)
  assert(chunks[0].length < payload.length)
  assert.equal(endCalls, 0)
  assert.equal(errorCalls, 0)

  responseController.resume()
  await ended
  assert.strictEqual(endController, responseController)
  assert.deepEqual(endTrailers, trailers)
  assert.deepEqual(responseController.rawTrailers, controller.rawTrailers)
  assert.deepEqual(Buffer.concat(chunks), payload)
  assert(chunks.length > 1)
  assert.equal(endCalls, 1)
  assert.equal(errorCalls, 0)
})

for (const { name, contentEncoding, compress } of [
  {
    name: 'single decoder',
    contentEncoding: 'gzip',
    compress: gzipSync
  },
  {
    name: 'chained decoders',
    contentEncoding: 'gzip, deflate',
    compress: payload => deflateSync(gzipSync(payload))
  }
]) {
  test(`decompress backpressure delays ${name} completion after the final chunk`, { timeout: 5000 }, async () => {
    const payload = Buffer.from('the only decoded chunk')
    const compressed = compress(payload)
    const chunks = []
    let responseController
    let endCalls = 0
    let errorCalls = 0
    let firstDataResolve
    const firstData = new Promise(resolve => { firstDataResolve = resolve })
    let endResolve
    const ended = new Promise(resolve => { endResolve = resolve })
    const handler = {
      onRequestStart (controller) {
        responseController = controller
      },
      onResponseStart () {},
      onResponseData (controller, chunk) {
        chunks.push(chunk)
        if (chunks.length === 1) {
          controller.pause()
          firstDataResolve()
        }
      },
      onResponseEnd () {
        endCalls++
        endResolve()
      },
      onResponseError () {
        errorCalls++
        endResolve()
      }
    }

    const { controller, sourceHandler } = createControlledDispatch(handler)
    sourceHandler.onResponseStart(controller, 200, { 'content-encoding': contentEncoding }, 'OK')
    sourceHandler.onResponseData(controller, compressed)
    sourceHandler.onResponseEnd(controller, { final: 'trailer' })

    await firstData
    await immediate()
    assert.equal(chunks.length, 1)
    assert.deepEqual(chunks[0], payload)
    assert.equal(endCalls, 0)
    assert.equal(errorCalls, 0)

    responseController.resume()
    await ended
    assert.equal(endCalls, 1)
    assert.equal(errorCalls, 0)
  })
}

test('decompress backpressure delays empty response completion while paused', { timeout: 5000 }, async () => {
  const compressed = gzipSync(Buffer.alloc(0))
  let responseController
  let dataCalls = 0
  let endCalls = 0
  let errorCalls = 0
  let endResolve
  const ended = new Promise(resolve => { endResolve = resolve })
  const handler = {
    onRequestStart (controller) {
      responseController = controller
    },
    onResponseStart (controller) {
      controller.pause()
    },
    onResponseData () {
      dataCalls++
    },
    onResponseEnd () {
      endCalls++
      endResolve()
    },
    onResponseError () {
      errorCalls++
      endResolve()
    }
  }

  const { controller, sourceHandler } = createControlledDispatch(handler)
  sourceHandler.onResponseStart(controller, 200, { 'content-encoding': 'gzip' }, 'OK')
  sourceHandler.onResponseData(controller, compressed)
  sourceHandler.onResponseEnd(controller, {})

  for (let i = 0; i < 5; i++) {
    await immediate()
  }
  assert.equal(dataCalls, 0)
  assert.equal(endCalls, 0)
  assert.equal(errorCalls, 0)

  responseController.resume()
  await ended
  assert.equal(dataCalls, 0)
  assert.equal(endCalls, 1)
  assert.equal(errorCalls, 0)
})

test('decompress backpressure bounds an initially unread request body', { timeout: 5000 }, async t => {
  const payload = Buffer.alloc(2 * 1024 * 1024, 0x62)
  const compressed = gzipSync(payload)
  let finishResolve
  const responseFinished = new Promise(resolve => { finishResolve = resolve })
  const server = createServer({ joinDuplicateHeaders: true }, (_req, res) => {
    res.once('finish', finishResolve)
    res.writeHead(200, {
      'Content-Encoding': 'gzip',
      'Content-Length': compressed.length
    })
    res.end(compressed)
  })

  server.listen(0)
  await once(server, 'listening')
  const client = new Client(`http://localhost:${server.address().port}`)
    .compose(interceptors.decompress())

  t.after(async () => {
    await client.destroy()
    server.closeAllConnections?.()
    if (server.listening) {
      server.close()
      await once(server, 'close')
    }
  })

  const { body } = await client.request({
    method: 'GET',
    path: '/',
    highWaterMark: 32 * 1024
  })

  if (body.readableLength === 0) {
    await once(body, 'readable')
  }
  await responseFinished
  for (let i = 0; i < 100 && body.readableLength < body.readableHighWaterMark; i++) {
    await immediate()
  }

  assert(body.readableLength >= body.readableHighWaterMark)
  assert(
    body.readableLength <= body.readableHighWaterMark + 16 * 1024,
    `buffered ${body.readableLength} bytes for HWM ${body.readableHighWaterMark}`
  )
  assert(body.readableLength < payload.length / 4)
  assert.deepEqual(Buffer.from(await body.arrayBuffer()), payload)
})

test('decompress backpressure honors the first decoder write result', { timeout: 5000 }, async () => {
  const payload = Buffer.allocUnsafe(256 * 1024)
  let random = 0x12345678
  for (let i = 0; i < payload.length; i++) {
    random ^= random << 13
    random ^= random >>> 17
    random ^= random << 5
    payload[i] = random & 0xff
  }
  const compressed = gzipSync(payload)
  assert(compressed.length > 64 * 1024)

  const chunks = []
  let endCalls = 0
  let receivedError
  let terminalResolve
  const terminal = new Promise(resolve => { terminalResolve = resolve })
  const handler = {
    onRequestStart () {},
    onResponseStart () {},
    onResponseData (controller, chunk) {
      chunks.push(chunk)
    },
    onResponseEnd () {
      endCalls++
      terminalResolve()
    },
    onResponseError (controller, error) {
      receivedError = error
      terminalResolve()
    }
  }

  const { controller, events, sourceHandler, state } = createControlledDispatch(handler)
  sourceHandler.onResponseStart(controller, 200, { 'content-encoding': 'gzip' }, 'OK')
  events.push('source-data')
  sourceHandler.onResponseData(controller, compressed)

  assert.equal(state.paused, true)
  assert.equal(state.pauseCalls, 1)
  while (state.resumeCalls === 0) {
    await immediate()
  }
  assert.equal(state.resumeCalls, 1)
  events.push('source-end')
  sourceHandler.onResponseEnd(controller, {})
  await terminal

  assert.equal(receivedError, undefined)
  assert.equal(endCalls, 1)
  assert.deepEqual(Buffer.concat(chunks), payload)
  assert(events.indexOf('controller-pause') > events.indexOf('source-data'))
  assert(events.indexOf('controller-resume') > events.indexOf('controller-pause'))
  assert(events.indexOf('source-end') > events.indexOf('controller-resume'))
})

test('decompress backpressure keeps input and downstream pause reasons independent', { timeout: 5000 }, async () => {
  const payload = Buffer.allocUnsafe(128 * 1024)
  let random = 0x87654321
  for (let i = 0; i < payload.length; i++) {
    random ^= random << 13
    random ^= random >>> 17
    random ^= random << 5
    payload[i] = random & 0xff
  }
  const compressed = gzipSync(payload)
  assert(compressed.length > 64 * 1024)

  let responseController
  const chunks = []
  let terminalResolve
  let terminalReject
  const terminal = new Promise((resolve, reject) => {
    terminalResolve = resolve
    terminalReject = reject
  })
  const handler = {
    onRequestStart (controller) {
      responseController = controller
    },
    onResponseStart (controller) {
      controller.pause()
    },
    onResponseData (controller, chunk) {
      chunks.push(chunk)
    },
    onResponseEnd () {
      terminalResolve()
    },
    onResponseError (controller, error) {
      terminalReject(error)
    }
  }

  const { controller, sourceHandler, state } = createControlledDispatch(handler)
  sourceHandler.onResponseStart(controller, 200, { 'content-encoding': 'gzip' }, 'OK')
  assert.equal(state.paused, true)
  assert.equal(state.pauseCalls, 1)

  sourceHandler.onResponseData(controller, compressed)
  assert.equal(chunks.length, 0)

  responseController.resume()
  assert.equal(state.paused, true)
  assert.equal(state.resumeCalls, 0)

  while (state.resumeCalls === 0) {
    await immediate()
  }
  sourceHandler.onResponseEnd(controller, {})
  await terminal
  assert.equal(state.pauseCalls, 1)
  assert.equal(state.resumeCalls, 1)
  assert.deepEqual(Buffer.concat(chunks), payload)
})

test('decompress backpressure pauses chained output through encoded end', { timeout: 5000 }, async () => {
  const payload = Buffer.alloc(512 * 1024, 0x63)
  const compressed = deflateSync(gzipSync(payload))
  const chunks = []
  let responseController
  let endCalls = 0
  let errorCalls = 0
  let firstDataResolve
  const firstData = new Promise(resolve => { firstDataResolve = resolve })
  let endResolve
  const ended = new Promise(resolve => { endResolve = resolve })
  const handler = {
    onRequestStart (controller) {
      responseController = controller
    },
    onResponseStart () {},
    onResponseData (controller, chunk) {
      chunks.push(chunk)
      if (chunks.length === 1) {
        controller.pause()
        firstDataResolve()
      }
    },
    onResponseEnd () {
      endCalls++
      endResolve()
    },
    onResponseError () {
      errorCalls++
      endResolve()
    }
  }

  const { controller, sourceHandler } = createControlledDispatch(handler)
  sourceHandler.onResponseStart(controller, 200, { 'content-encoding': 'gzip, deflate' }, 'OK')
  sourceHandler.onResponseData(controller, compressed)
  sourceHandler.onResponseEnd(controller, { chained: 'trailer' })

  await firstData
  await immediate()
  assert.equal(chunks.length, 1)
  assert.equal(endCalls, 0)
  assert.equal(errorCalls, 0)

  responseController.resume()
  await ended
  assert.deepEqual(Buffer.concat(chunks), payload)
  assert(chunks.length > 1)
  assert.equal(endCalls, 1)
  assert.equal(errorCalls, 0)
})

test('decompress backpressure remains paused when retry replaces the transport controller', { timeout: 5000 }, async () => {
  const payload = Buffer.alloc(512 * 1024, 0x65)
  const compressed = gzipSync(payload)
  const split = compressed.length - 8
  assert(split > 0)
  assert(compressed.length < 16 * 1024)

  const attempts = []
  const baseDispatch = (opts, sourceHandler) => {
    const state = {
      paused: false,
      pauseCalls: 0,
      resumeCalls: 0
    }
    let abortReason = null
    const controller = {
      rawHeaders: null,
      rawTrailers: null,
      pause () {
        state.paused = true
        state.pauseCalls++
      },
      resume () {
        state.paused = false
        state.resumeCalls++
      },
      abort (reason) {
        abortReason = reason
      },
      get paused () { return state.paused },
      get aborted () { return abortReason !== null },
      get reason () { return abortReason }
    }

    attempts.push({ controller, opts, sourceHandler, state })
    sourceHandler.onRequestStart(controller, {})
    return true
  }

  const retryDispatch = interceptors.retry({
    maxRetries: 1,
    retry (_ignoredError, _context, callback) {
      callback(null)
    }
  })(baseDispatch)
  const dispatch = createDecompressInterceptor()(retryDispatch)

  let responseController
  const chunks = []
  let firstDataResolve
  const firstData = new Promise(resolve => { firstDataResolve = resolve })
  let terminalResolve
  let terminalReject
  const terminal = new Promise((resolve, reject) => {
    terminalResolve = resolve
    terminalReject = reject
  })
  const handler = {
    onRequestStart (controller) {
      responseController = controller
    },
    onResponseStart () {},
    onResponseData (controller, chunk) {
      chunks.push(chunk)
      if (chunks.length === 1) {
        controller.pause()
        firstDataResolve()
      }
    },
    onResponseEnd () {
      terminalResolve()
    },
    onResponseError (controller, error) {
      terminalReject(error)
    }
  }

  dispatch({ method: 'GET', path: '/' }, handler)
  assert.equal(attempts.length, 1)
  const first = attempts[0]
  first.controller.rawHeaders = ['Content-Encoding', 'gzip', 'Content-Length', String(compressed.length)]
  first.sourceHandler.onResponseStart(first.controller, 200, {
    'content-encoding': 'gzip',
    'content-length': String(compressed.length)
  }, 'OK')
  first.sourceHandler.onResponseData(first.controller, compressed.subarray(0, split))

  await firstData
  assert.equal(first.state.paused, true)
  assert.equal(first.state.pauseCalls, 1)

  const connectionError = new Error('connection reset during encoded response')
  connectionError.code = 'ECONNRESET'
  first.sourceHandler.onResponseError(first.controller, connectionError)

  assert.equal(attempts.length, 2)
  const second = attempts[1]
  assert.equal(second.opts.headers.range, `bytes=${split}-${compressed.length - 1}`)
  assert.equal(second.state.paused, true)
  assert.equal(second.state.pauseCalls, 1)

  second.controller.rawHeaders = [
    'Content-Encoding', 'gzip',
    'Content-Range', `bytes ${split}-${compressed.length - 1}/${compressed.length}`,
    'Content-Length', String(compressed.length - split)
  ]
  second.sourceHandler.onResponseStart(second.controller, 206, {
    'content-encoding': 'gzip',
    'content-range': `bytes ${split}-${compressed.length - 1}/${compressed.length}`,
    'content-length': String(compressed.length - split)
  }, 'Partial Content')

  responseController.resume()
  assert.equal(second.state.paused, false)
  assert.equal(second.state.resumeCalls, 1)

  second.sourceHandler.onResponseData(second.controller, compressed.subarray(split))
  second.sourceHandler.onResponseEnd(second.controller, { retried: 'trailer' })
  await terminal
  assert.deepEqual(Buffer.concat(chunks), payload)
})

test('decompress abort while decoded output is paused errors exactly once', { timeout: 5000 }, async () => {
  const payload = Buffer.alloc(512 * 1024, 0x64)
  const compressed = gzipSync(payload)
  const abortReason = new Error('abort paused decompression')
  let responseController
  let dataCalls = 0
  let endCalls = 0
  const errors = []
  const errorControllers = []
  let firstDataResolve
  const firstData = new Promise(resolve => { firstDataResolve = resolve })
  let errorResolve
  const errored = new Promise(resolve => { errorResolve = resolve })
  const handler = {
    onRequestStart (controller) {
      responseController = controller
    },
    onResponseStart () {},
    onResponseData (controller) {
      dataCalls++
      if (dataCalls === 1) {
        controller.pause()
        firstDataResolve()
      }
    },
    onResponseEnd () {
      endCalls++
    },
    onResponseError (controller, error) {
      errorControllers.push(controller)
      errors.push(error)
      errorResolve()
    }
  }

  const { controller, sourceHandler } = createControlledDispatch(handler, undefined, { forwardAbort: false })
  sourceHandler.onResponseStart(controller, 200, { 'content-encoding': 'gzip' }, 'OK')
  sourceHandler.onResponseData(controller, compressed)
  sourceHandler.onResponseEnd(controller, {})

  await firstData
  await immediate()
  assert.equal(dataCalls, 1)
  assert.equal(endCalls, 0)

  responseController.abort(abortReason)
  await errored
  await immediate()
  assert.equal(dataCalls, 1)
  assert.equal(endCalls, 0)
  assert.deepEqual(errors, [abortReason])
  assert.deepEqual(errorControllers, [responseController])
  assert.equal(responseController.aborted, true)
  assert.strictEqual(responseController.reason, abortReason)
})

test('should handle multiple pause/resume cycles during decompression', async t => {
  t = tspl(t, { plan: 3 })

  const data = 'Large data chunk for testing multiple pause/resume cycles. '.repeat(1000)
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

  let controller
  let callCount = 0
  let responseData = ''

  const handler = {
    onRequestStart (ctrl) {
      controller = ctrl
    },

    onResponseStart (ctrl, statusCode, headers, statusMessage) {
      t.equal(statusCode, 200)

      for (let i = 0; i < 3; i++) {
        callCount++
        controller.pause()
        controller.resume()
      }
    },

    onResponseData (ctrl, chunk) {
      responseData += chunk.toString()
    },

    onResponseEnd (ctrl, trailers) {
      t.equal(callCount, 3, 'Should have called pause/resume 3 times')
      t.equal(responseData, data, 'All data should be received')
    },

    onResponseError (ctrl, err) {
      t.fail(err)
    }
  }

  await client.dispatch({
    method: 'GET',
    path: '/'
  }, handler)

  await t.completed
})

test('should handle controller pause with chained decompression', async t => {
  t = tspl(t, { plan: 3 })

  const data = 'Test data for chained decompression pause/resume functionality'
  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    const gzip = createGzip()
    const deflate = createDeflate()

    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'gzip, deflate'
    })

    gzip.pipe(deflate)
    deflate.pipe(res)
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

  let controller
  let pauseResumeWorked = false
  let responseData = ''

  const handler = {
    onRequestStart (ctrl) {
      controller = ctrl
    },

    onResponseStart (ctrl, statusCode, headers, statusMessage) {
      t.equal(statusCode, 200)

      try {
        controller.pause()
        controller.resume()
        pauseResumeWorked = true
      } catch (err) {
        t.fail('Pause/resume should not throw error')
      }
    },

    onResponseData (ctrl, chunk) {
      responseData += chunk.toString()
    },

    onResponseEnd (ctrl, trailers) {
      t.ok(pauseResumeWorked, 'Pause/resume should work with chained decompression')
      t.equal(responseData, data, 'Data should be correctly decompressed from chained encodings')
    },

    onResponseError (ctrl, err) {
      t.fail(err)
    }
  }

  await client.dispatch({
    method: 'GET',
    path: '/'
  }, handler)

  await t.completed
})

test('should disable the decompressed size limit by default', async t => {
  t = tspl(t, { plan: 1 })

  const decompressedSize = 64 * 1024 * 1024 + 1
  const compressed = gzipSync(Buffer.alloc(decompressedSize, 0x61))
  const server = createServer({ joinDuplicateHeaders: true }, (_req, res) => {
    res.writeHead(200, {
      'Content-Encoding': 'gzip',
      'Content-Length': compressed.length
    })
    res.end(compressed)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(interceptors.decompress())

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  let received = 0
  for await (const chunk of response.body) {
    received += chunk.length
  }

  t.equal(received, decompressedSize)

  await t.completed
})

test('should reject a response that exceeds maxSize after decompression', async t => {
  t = tspl(t, { plan: 1 })

  const data = 'a'.repeat(1024 * 1024)
  const compressed = gzipSync(data)
  const server = createServer({ joinDuplicateHeaders: true }, (_req, res) => {
    res.writeHead(200, {
      'Content-Encoding': 'gzip',
      'Content-Length': compressed.length
    })
    res.end(compressed)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(interceptors.decompress({ maxSize: 1024 }))

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  await t.rejects(response.body.text(), {
    name: 'ResponseExceededMaxSizeError',
    code: 'UND_ERR_RES_EXCEEDED_MAX_SIZE'
  })

  await t.completed
})

test('should enforce maxSize on intermediate output of a decompression chain', async t => {
  t = tspl(t, { plan: 1 })

  // The outer deflate layer expands to many concatenated empty gzip members.
  // The final gunzip output is empty, so only an intermediate-stage limit
  // catches the amplification.
  const gzipMembers = Buffer.concat(Array(100).fill(gzipSync('')))
  const compressed = deflateSync(gzipMembers)
  const server = createServer({ joinDuplicateHeaders: true }, (_req, res) => {
    res.writeHead(200, {
      'Content-Encoding': 'gzip, deflate'
    })
    res.end(compressed)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(interceptors.decompress({ maxSize: 1024 }))

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  await t.rejects(response.body.text(), {
    name: 'ResponseExceededMaxSizeError',
    code: 'UND_ERR_RES_EXCEEDED_MAX_SIZE'
  })

  await t.completed
})

test('should enforce maxSize on the final output of a decompression chain', async t => {
  t = tspl(t, { plan: 2 })

  const data = 'chained decompression limit'.repeat(100)
  const compressed = deflateSync(gzipSync(data))
  const server = createServer({ joinDuplicateHeaders: true }, (_req, res) => {
    res.writeHead(200, {
      'Content-Encoding': 'gzip, deflate'
    })
    res.end(compressed)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(interceptors.decompress({ maxSize: data.length - 1 }))

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  await t.rejects(response.body.text(), err => {
    t.ok(err instanceof errors.ResponseExceededMaxSizeError)
    return true
  })

  await t.completed
})

test('should apply maxSize independently to every decompression stage', async t => {
  t = tspl(t, { plan: 2 })

  const data = Buffer.from(Array.from({ length: 1024 }, (_, index) => index % 251))
  const intermediate = gzipSync(data)
  const compressed = deflateSync(intermediate)
  const maxSize = Math.max(data.length, intermediate.length)
  t.ok(data.length + intermediate.length > maxSize)

  const server = createServer({ joinDuplicateHeaders: true }, (_req, res) => {
    res.writeHead(200, {
      'Content-Encoding': 'gzip, deflate'
    })
    res.end(compressed)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(interceptors.decompress({ maxSize }))

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  t.deepStrictEqual(Buffer.from(await response.body.arrayBuffer()), data)

  await t.completed
})

test('should work when composed after the retry interceptor', async t => {
  t = tspl(t, { plan: 1 })

  const data = 'retry composition response'
  const compressed = gzipSync(data)
  const server = createServer({ joinDuplicateHeaders: true }, (_req, res) => {
    res.writeHead(200, {
      'Content-Encoding': 'gzip',
      'Content-Length': compressed.length
    })
    res.end(compressed)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose([
    interceptors.retry(),
    interceptors.decompress({ maxSize: Buffer.byteLength(data) })
  ])

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  t.equal(await response.body.text(), data)

  await t.completed
})

test('should allow a decompressed response exactly equal to maxSize', async t => {
  t = tspl(t, { plan: 1 })

  const data = 'maximum size response'
  const compressed = gzipSync(data)
  const server = createServer({ joinDuplicateHeaders: true }, (_req, res) => {
    res.writeHead(200, {
      'Content-Encoding': 'gzip'
    })
    res.end(compressed)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(interceptors.decompress({ maxSize: Buffer.byteLength(data) }))

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  t.equal(await response.body.text(), data)

  await t.completed
})

test('should reject invalid maxSize values', async t => {
  t = tspl(t, { plan: 5 })

  const unlimitedDispatch = createDecompressInterceptor({ maxSize: 0 })(() => true)
  t.doesNotThrow(() => unlimitedDispatch({ method: 'GET' }, {}))

  for (const maxSize of [-1, 1.5, Infinity, '1024']) {
    const dispatch = createDecompressInterceptor({ maxSize })(() => true)
    t.throws(() => dispatch({ method: 'GET' }, {}), {
      name: 'InvalidArgumentError',
      code: 'UND_ERR_INVALID_ARG',
      message: 'maxSize must be a non-negative integer'
    })
  }

  await t.completed
})

test('should behave like fetch() for compressed responses', async t => {
  t = tspl(t, { plan: 10 })

  const testData = 'Test data that will be compressed and should be automatically decompressed by both fetch and request with decompress interceptor'

  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    const gzip = createGzip()
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'gzip'
    })
    gzip.pipe(res)
    gzip.end(testData)
  })

  server.listen(0)
  await once(server, 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const { fetch } = require('../..')
  const fetchResponse = await fetch(baseUrl)
  const fetchBody = await fetchResponse.text()

  const client = new Client(baseUrl)
  const requestResponseWithoutDecompression = await client.request({
    method: 'GET',
    path: '/'
  })
  const requestBodyWithoutDecompression = await requestResponseWithoutDecompression.body.text()

  const clientWithDecompression = client.compose(createDecompressInterceptor())
  const requestResponseWithDecompression = await clientWithDecompression.request({
    method: 'GET',
    path: '/'
  })
  const requestBodyWithDecompression = await requestResponseWithDecompression.body.text()

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  t.equal(fetchResponse.status, 200)
  t.equal(fetchBody, testData, 'fetch should automatically decompress')
  t.equal(requestBodyWithDecompression, fetchBody, 'request with decompression interceptor should match fetch behavior')
  t.notEqual(requestBodyWithoutDecompression, fetchBody, 'request without decompression interceptor should return compressed data')
  t.equal(fetchResponse.headers.get('content-type'), 'text/plain', 'content-type header should be preserved with fetch')
  t.equal(fetchResponse.headers.get('content-encoding'), 'gzip', 'content-encoding header should be preserved with fetch')
  t.equal(requestResponseWithoutDecompression.headers['content-type'], 'text/plain', 'content-type header should be preserved without decompression')
  t.equal(requestResponseWithoutDecompression.headers['content-encoding'], 'gzip', 'content-encoding header should be preserved without decompression')
  t.equal(requestResponseWithDecompression.headers['content-type'], 'text/plain', 'content-type header should be preserved with decompression')
  t.equal(requestResponseWithDecompression.headers['content-encoding'], undefined, 'content-encoding header should be removed with decompression')
  await t.completed
})

// CVE fix: Limit the number of content-encodings to prevent resource exhaustion
// Similar to urllib3 (GHSA-gm62-xv2j-4w53) and curl (CVE-2022-32206)
const MAX_CONTENT_ENCODINGS = 5

test(`should allow exactly ${MAX_CONTENT_ENCODINGS} content-encodings`, async t => {
  t = tspl(t, { plan: 3 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    // Use identity encodings (no actual compression) for simplicity
    const encodings = Array(MAX_CONTENT_ENCODINGS).fill('identity').join(', ')
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Encoding': encodings
    })
    res.end('test')
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

  // With 5 identity encodings, the interceptor should pass through (identity is not in supportedEncodings)
  t.equal(response.statusCode, 200)
  t.ok(response.headers['content-encoding'], 'content-encoding header should be preserved for identity')
  t.equal(await response.body.text(), 'test')

  await t.completed
})

test(`should reject more than ${MAX_CONTENT_ENCODINGS} content-encodings`, async t => {
  t = tspl(t, { plan: 1 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    const encodings = Array(MAX_CONTENT_ENCODINGS + 1).fill('gzip').join(', ')
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Encoding': encodings
    })
    res.end('test')
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

  try {
    const response = await client.request({
      method: 'GET',
      path: '/'
    })
    await response.body.text()
    t.fail('Should have thrown an error')
  } catch (err) {
    t.ok(err.message.includes('content-encoding'), 'Error should mention content-encoding')
  }

  await t.completed
})

test('should reject excessive content-encoding chains', async t => {
  t = tspl(t, { plan: 1 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    const encodings = Array(100).fill('gzip').join(', ')
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Encoding': encodings
    })
    res.end('test')
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

  try {
    const response = await client.request({
      method: 'GET',
      path: '/'
    })
    await response.body.text()
    t.fail('Should have thrown an error')
  } catch (err) {
    t.ok(err.message.includes('content-encoding'), 'Error should mention content-encoding')
  }

  await t.completed
})

test('should work with global dispatcher for both fetch() and request()', async t => {
  t = tspl(t, { plan: 8 })

  const testData = 'Global dispatcher test data for decompression interceptor'

  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    const gzip = createGzip()
    const chunks = []

    gzip.on('data', chunk => chunks.push(chunk))
    gzip.on('end', () => {
      const compressedData = Buffer.concat(chunks)
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'Content-Encoding': 'gzip',
        'Content-Length': compressedData.length
      })
      res.end(compressedData)
    })

    gzip.end(testData)
  })

  server.listen(0)
  await once(server, 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const originalDispatcher = getGlobalDispatcher()

  setGlobalDispatcher(getGlobalDispatcher().compose(createDecompressInterceptor()))

  after(async () => {
    setGlobalDispatcher(originalDispatcher)
    server.close()
    await once(server, 'close')
  })

  const { fetch } = require('../..')
  const fetchResponse = await fetch(baseUrl)
  const fetchBody = await fetchResponse.text()

  const requestResponse = await request(baseUrl, {
    method: 'GET'
  })
  const requestBody = await requestResponse.body.text()

  t.equal(fetchResponse.status, 200)
  t.equal(fetchBody, testData, 'fetch should automatically decompress with global interceptor')
  t.equal(requestResponse.statusCode, 200)
  t.equal(requestBody, testData, 'request should automatically decompress with global interceptor')
  t.equal(requestResponse.headers['content-encoding'], undefined, 'request content-encoding header should be removed with global interceptor')
  t.equal(requestResponse.headers['content-length'], undefined, 'request content-length header should be removed with global interceptor')
  t.equal(fetchResponse.headers.get('content-length'), undefined, 'content-length header should be removed with fetch due to global interceptor')
  t.equal(fetchResponse.headers.get('content-encoding'), undefined, 'content-encoding header should be removed with fetch due to global interceptor')

  await t.completed
})

test('should decompress a response whose content-encoding arrives as repeated header lines', async t => {
  t = tspl(t, { plan: 2 })

  const net = require('node:net')

  const data = 'Repeated Content-Encoding field lines, joined per RFC 9110 section 5.3.'
  const body = gzipSync(gzipSync(data))

  const server = net.createServer(socket => {
    socket.once('data', () => {
      socket.write(
        'HTTP/1.1 200 OK\r\n' +
        'Content-Type: text/plain\r\n' +
        'Content-Encoding: gzip\r\n' +
        'Content-Encoding: gzip\r\n' +
        `Content-Length: ${body.length}\r\n` +
        'Connection: close\r\n' +
        '\r\n'
      )
      socket.end(body)
    })
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

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), data)

  await t.completed
})
