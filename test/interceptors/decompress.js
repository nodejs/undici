'use strict'

const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { createGzip, createDeflate, createBrotliCompress, createZstdCompress } = require('node:zlib')
const { tspl } = require('@matteo.collina/tspl')

const { Client, getGlobalDispatcher, setGlobalDispatcher, request } = require('../..')
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

test('should decompress zstd response', { skip: typeof createZstdCompress !== 'function' }, async t => {
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
  t = tspl(t, { plan: 3 })

  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    // First compress with gzip, then with deflate (gzip, deflate)
    const gzip = createGzip()
    const deflate = createDeflate()

    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'gzip, deflate' // Applied in this order
    })

    const data = 'Multiple encoding test message'

    // Pipe: data → gzip → deflate → response
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

  const response = await client.request({
    method: 'GET',
    path: '/'
  })

  const body = await response.body.text()

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-encoding'], undefined) // Should be removed
  t.equal(body, 'Multiple encoding test message') // Should be fully decompressed

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
