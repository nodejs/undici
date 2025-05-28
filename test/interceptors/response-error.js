'use strict'

const assert = require('node:assert')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { test, after } = require('node:test')
const { interceptors, Client } = require('../..')
const { responseError } = interceptors

test('should throw error for error response', async () => {
  const server = createServer()

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
})

test('should not throw error for ok response', async () => {
  const server = createServer()

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
  const server = createServer()

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
  const server = createServer()

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
  const server = createServer()

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
