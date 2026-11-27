'use strict'

const assert = require('node:assert')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { test, after } = require('node:test')
const { gzipSync } = require('node:zlib')
const { interceptors, Client } = require('../..')
const { responseError } = interceptors

test('should throw error for error response', async () => {
  const server = createServer({ joinDuplicateHeaders: true })

  server.on('request', (req, res) => {
    res.writeHead(400, { 'content-type': 'text/plain' })
    res.end('Bad Request')
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(responseError())

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  let error
  try {
    await client.request({
      method: 'GET',
      path: '/',
      headers: {
        'content-type': 'text/plain'
      }
    })
  } catch (err) {
    error = err
  }

  assert.equal(error.statusCode, 400)
  assert.equal(error.message, 'Response Error')
  assert.equal(error.body, 'Bad Request')
  assert.equal(error.bodyTruncated, false)
})

test('should not throw error for ok response', async () => {
  const server = createServer({ joinDuplicateHeaders: true })

  server.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello')
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(responseError())

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request({
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'text/plain'
    }
  })

  assert.equal(response.statusCode, 200)
  assert.equal(await response.body.text(), 'hello')
})

test('should throw error for error response, parsing JSON', async () => {
  const server = createServer({ joinDuplicateHeaders: true })

  server.on('request', (req, res) => {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ message: 'Bad Request' }))
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(responseError())

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  let error
  try {
    await client.request({
      method: 'GET',
      path: '/',
      headers: {
        'content-type': 'text/plain'
      }
    })
  } catch (err) {
    error = err
  }

  assert.equal(error.statusCode, 400)
  assert.equal(error.message, 'Response Error')
  assert.deepStrictEqual(error.body, {
    message: 'Bad Request'
  })
})

test('should throw error for error response, parsing JSON without charset', async () => {
  const server = createServer({ joinDuplicateHeaders: true })

  server.on('request', (req, res) => {
    res.writeHead(400, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ message: 'Bad Request' }))
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(responseError())

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  let error
  try {
    await client.request({
      method: 'GET',
      path: '/',
      headers: {
        'content-type': 'text/plain'
      }
    })
  } catch (err) {
    error = err
  }

  assert.equal(error.statusCode, 400)
  assert.equal(error.message, 'Response Error')
  assert.deepStrictEqual(error.body, {
    message: 'Bad Request'
  })
})

test('should throw error for networking errors response', async () => {
  const client = new Client(
    'http://localhost:12345'
  ).compose(responseError())

  after(async () => {
    await client.close()
  })

  let error
  try {
    await client.request({
      method: 'GET',
      path: '/',
      headers: {
        'content-type': 'text/plain'
      }
    })
  } catch (err) {
    error = err
  }

  assert.equal(error.code, 'ECONNREFUSED')
})

test('should throw error for error response without content type', async () => {
  const server = createServer({ joinDuplicateHeaders: true })

  server.on('request', (req, res) => {
    res.writeHead(400, {})
    res.end()
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(responseError())

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  let error
  try {
    await client.request({
      method: 'GET',
      path: '/',
      headers: {
        'content-type': 'text/plain'
      }
    })
  } catch (err) {
    error = err
  }

  assert.equal(error.statusCode, 400)
  assert.equal(error.message, 'Response Error')
  assert.deepStrictEqual(error.body, '')
})

test('should limit the error response body', async () => {
  const server = createServer({ joinDuplicateHeaders: true })

  server.on('request', (req, res) => {
    res.writeHead(500, { 'content-type': 'text/plain' })
    res.write('abc')
    setImmediate(() => res.end('def'))
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(responseError({ maxSize: 5 }))

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  await assert.rejects(client.request({
    method: 'GET',
    path: '/'
  }), error => {
    assert.equal(error.code, 'UND_ERR_RESPONSE')
    assert.equal(error.statusCode, 500)
    assert.equal(error.body, 'abcde')
    assert.equal(error.bodyTruncated, true)
    return true
  })
})

test('should not parse a truncated JSON error response', async () => {
  const server = createServer({ joinDuplicateHeaders: true })

  server.on('request', (req, res) => {
    res.writeHead(400, { 'content-type': 'application/json' })
    res.end('{"ok":true}')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(responseError({ maxSize: 6 }))

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  await assert.rejects(client.request({
    method: 'GET',
    path: '/'
  }), error => {
    assert.equal(error.body, '{"ok":')
    assert.equal(error.bodyTruncated, true)
    return true
  })
})

test('should limit the error response body to 1 MiB by default', async () => {
  const server = createServer({ joinDuplicateHeaders: true })

  server.on('request', (req, res) => {
    res.writeHead(500, { 'content-type': 'text/plain' })
    res.end('x'.repeat(1024 * 1024 + 1))
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(responseError())

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  await assert.rejects(client.request({
    method: 'GET',
    path: '/'
  }), error => {
    assert.equal(error.body.length, 1024 * 1024)
    assert.equal(error.bodyTruncated, true)
    return true
  })
})

test('should limit a decompressed error response body', async () => {
  const server = createServer({ joinDuplicateHeaders: true })
  const body = gzipSync('x'.repeat(1024))

  server.on('request', (req, res) => {
    res.writeHead(500, {
      'content-encoding': 'gzip',
      'content-type': 'text/plain'
    })
    res.end(body)
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose([
    interceptors.decompress({ skipErrorResponses: false }),
    responseError({ maxSize: 64 })
  ])

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  await assert.rejects(client.request({
    method: 'GET',
    path: '/'
  }), error => {
    assert.equal(error.body, 'x'.repeat(64))
    assert.equal(error.bodyTruncated, true)
    return true
  })
})

test('should flush an incomplete UTF-8 sequence when truncating', async () => {
  const server = createServer({ joinDuplicateHeaders: true })

  server.on('request', (req, res) => {
    res.writeHead(400, { 'content-type': 'text/plain' })
    res.end('€x')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(responseError({ maxSize: 2 }))

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  await assert.rejects(client.request({
    method: 'GET',
    path: '/'
  }), error => {
    assert.equal(error.body, '\ufffd')
    assert.equal(error.bodyTruncated, true)
    return true
  })
})

test('should allow an error response body exactly equal to maxSize', async () => {
  const server = createServer({ joinDuplicateHeaders: true })

  server.on('request', (req, res) => {
    res.writeHead(400, { 'content-type': 'text/plain' })
    res.end('€')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(responseError({ maxSize: 3 }))

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  await assert.rejects(client.request({
    method: 'GET',
    path: '/'
  }), error => {
    assert.equal(error.body, '€')
    assert.equal(error.bodyTruncated, false)
    return true
  })
})

test('should allow maxSize to be disabled', async () => {
  const server = createServer({ joinDuplicateHeaders: true })

  server.on('request', (req, res) => {
    res.writeHead(400, { 'content-type': 'text/plain' })
    res.end('unlimited')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(responseError({ maxSize: 0 }))

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  await assert.rejects(client.request({
    method: 'GET',
    path: '/'
  }), error => {
    assert.equal(error.body, 'unlimited')
    assert.equal(error.bodyTruncated, false)
    return true
  })
})

test('should validate maxSize', () => {
  for (const maxSize of [-1, 1.5, NaN, Infinity, '1024']) {
    assert.throws(() => responseError({ maxSize }), {
      code: 'UND_ERR_INVALID_ARG',
      message: 'maxSize must be a non-negative integer'
    })
  }
})
