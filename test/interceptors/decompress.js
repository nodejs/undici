'use strict'

const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { createGzip, createDeflate, createBrotliCompress, createZstdCompress } = require('node:zlib')

const { Client, getGlobalDispatcher, setGlobalDispatcher, request } = require('../..')
const createDecompressInterceptor = require('../../lib/interceptor/decompress')

test('should decompress gzip response', async t => {
  t.plan(3)

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

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.headers['content-encoding'], undefined)
  t.assert.strictEqual(body, data)
})

test('should decompress deflate response', async t => {
  t.plan(3)

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

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.headers['content-encoding'], undefined)
  t.assert.strictEqual(body, 'This message is compressed with deflate algorithm!')
})

test('should decompress brotli response', async t => {
  t.plan(3)

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

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.headers['content-encoding'], undefined)
  t.assert.strictEqual(body, 'This message is compressed with brotli compression!')
})

test('should decompress zstd response', { skip: typeof createZstdCompress !== 'function' }, async t => {
  t.plan(3)

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

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.headers['content-encoding'], undefined)
  t.assert.strictEqual(body, 'This message is compressed with zstd compression!')
})

test('should pass through uncompressed response', async t => {
  t.plan(3)

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

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.headers['content-type'], 'text/plain')
  t.assert.strictEqual(body, 'This is uncompressed data')
})

test('should pass through unsupported encoding', async t => {
  t.plan(3)

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

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.headers['content-encoding'], 'unsupported')
  t.assert.strictEqual(body, 'This has unsupported encoding')
})

test('should pass through error responses (4xx, 5xx)', async t => {
  t.plan(3)

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

  t.assert.strictEqual(response.statusCode, 404)
  t.assert.strictEqual(response.headers['content-encoding'], 'gzip')
  t.assert.notEqual(body, 'Not found error message')
})

test('should pass through 204 No Content responses', async t => {
  t.plan(2)

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

  t.assert.strictEqual(response.statusCode, 204)
  t.assert.strictEqual(response.headers['content-encoding'], 'gzip')
})

test('should pass through 304 Not Modified responses', async t => {
  t.plan(2)

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

  t.assert.strictEqual(response.statusCode, 304)
  t.assert.strictEqual(response.headers['content-encoding'], 'gzip')
})

test('should handle large compressed responses', async t => {
  t.plan(3)

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

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.headers['content-encoding'], undefined)
  t.assert.strictEqual(body.length, 30000)
})

test('should handle case-insensitive content-encoding', async t => {
  t.plan(3)

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

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.headers['content-encoding'], undefined)
  t.assert.strictEqual(body, 'Case insensitive test')
})

test('should remove content-length header when decompressing', async t => {
  t.plan(3)

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

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.headers['content-length'], undefined)
  t.assert.strictEqual(body, 'Test data')
})

test('should allow decompressing 5xx responses when skipErrorResponses is false', async t => {
  t.plan(3)

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

  t.assert.strictEqual(response.statusCode, 500)
  t.assert.strictEqual(response.headers['content-encoding'], undefined) // Should be removed when decompressing
  t.assert.strictEqual(body, 'Internal server error message') // Should be decompressed
})

test('should allow custom skipStatusCodes', async t => {
  t.plan(3)

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

  t.assert.strictEqual(response.statusCode, 201)
  t.assert.strictEqual(response.headers['content-encoding'], 'gzip') // Should be preserved when skipping
  t.assert.notEqual(body, 'Created response') // Should still be compressed
})

test('should decompress multiple encodings in correct order', async t => {
  t.plan(3)

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

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.headers['content-encoding'], undefined) // Should be removed
  t.assert.strictEqual(body, 'Multiple encoding test message') // Should be fully decompressed
})

test('should handle legacy encoding names (x-gzip)', async t => {
  t.plan(3)

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

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.headers['content-encoding'], undefined) // Should be removed
  t.assert.strictEqual(body, 'Legacy encoding test')
})

test('should pass through responses with unsupported encoding in chain', async t => {
  t.plan(3)

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

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.headers['content-encoding'], 'gzip, unsupported, deflate') // Should be preserved
  t.assert.strictEqual(body, 'This should pass through unchanged')
})

test('should handle empty encoding values', async t => {
  t.plan(3)

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

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.headers['content-encoding'], undefined)
  t.assert.strictEqual(body, 'Empty encoding value test')
})

test('should handle multiple pause/resume cycles during decompression', async t => {
  t.plan(3)

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
      t.assert.strictEqual(statusCode, 200)

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
      t.assert.strictEqual(callCount, 3, 'Should have called pause/resume 3 times')
      t.assert.strictEqual(responseData, data, 'All data should be received')
    },

    onResponseError (ctrl, err) {
      t.assert.fail(err)
    }
  }

  await client.dispatch({
    method: 'GET',
    path: '/'
  }, handler)
})

test('should handle controller pause with chained decompression', async t => {
  t.plan(3)

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
      t.assert.strictEqual(statusCode, 200)

      try {
        controller.pause()
        controller.resume()
        pauseResumeWorked = true
      } catch (err) {
        t.assert.fail('Pause/resume should not throw error')
      }
    },

    onResponseData (ctrl, chunk) {
      responseData += chunk.toString()
    },

    onResponseEnd (ctrl, trailers) {
      t.assert.ok(pauseResumeWorked, 'Pause/resume should work with chained decompression')
      t.assert.strictEqual(responseData, data, 'Data should be correctly decompressed from chained encodings')
    },

    onResponseError (ctrl, err) {
      t.assert.fail(err)
    }
  }

  await client.dispatch({
    method: 'GET',
    path: '/'
  }, handler)
})

test('should behave like fetch() for compressed responses', async t => {
  t.plan(10)

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

  t.assert.strictEqual(fetchResponse.status, 200)
  t.assert.strictEqual(fetchBody, testData, 'fetch should automatically decompress')
  t.assert.strictEqual(requestBodyWithDecompression, fetchBody, 'request with decompression interceptor should match fetch behavior')
  t.assert.notEqual(requestBodyWithoutDecompression, fetchBody, 'request without decompression interceptor should return compressed data')
  t.assert.strictEqual(fetchResponse.headers.get('content-type'), 'text/plain', 'content-type header should be preserved with fetch')
  t.assert.strictEqual(fetchResponse.headers.get('content-encoding'), 'gzip', 'content-encoding header should be preserved with fetch')
  t.assert.strictEqual(requestResponseWithoutDecompression.headers['content-type'], 'text/plain', 'content-type header should be preserved without decompression')
  t.assert.strictEqual(requestResponseWithoutDecompression.headers['content-encoding'], 'gzip', 'content-encoding header should be preserved without decompression')
  t.assert.strictEqual(requestResponseWithDecompression.headers['content-type'], 'text/plain', 'content-type header should be preserved with decompression')
  t.assert.strictEqual(requestResponseWithDecompression.headers['content-encoding'], undefined, 'content-encoding header should be removed with decompression')
})

test('should work with global dispatcher for both fetch() and request()', async t => {
  t.plan(8)

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

  t.assert.strictEqual(fetchResponse.status, 200)
  t.assert.strictEqual(fetchBody, testData, 'fetch should automatically decompress with global interceptor')
  t.assert.strictEqual(requestResponse.statusCode, 200)
  t.assert.strictEqual(requestBody, testData, 'request should automatically decompress with global interceptor')
  t.assert.strictEqual(requestResponse.headers['content-encoding'], undefined, 'request content-encoding header should be removed with global interceptor')
  t.assert.strictEqual(requestResponse.headers['content-length'], undefined, 'request content-length header should be removed with global interceptor')
  t.assert.strictEqual(fetchResponse.headers.get('content-length'), null, 'content-length header should be removed with fetch due to global interceptor')
  t.assert.strictEqual(fetchResponse.headers.get('content-encoding'), null, 'content-encoding header should be removed with fetch due to global interceptor')
})
