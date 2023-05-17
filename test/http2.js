'use strict'

const { createSecureServer } = require('node:http2')
const { createReadStream, readFileSync } = require('node:fs')
const { once } = require('node:events')

const { test, plan } = require('tap')
const pem = require('https-pem')

const { Client } = require('..')

plan(5)

test('Should support H2 connection', async t => {
  const body = []
  const server = createSecureServer(pem)

  server.on('stream', (stream, headers) => {
    t.equal(headers['x-my-header'], 'foo')
    t.equal(headers[':method'], 'GET')
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })
    stream.end('hello h2!')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    }
  })

  t.plan(6)
  t.teardown(server.close.bind(server))
  t.teardown(client.close.bind(client))

  const response = await client.request({
    path: '/',
    method: 'GET',
    headers: {
      'x-my-header': 'foo'
    }
  })

  response.body.on('data', chunk => {
    body.push(chunk)
  })

  await once(response.body, 'end')
  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.equal(response.headers['x-custom-h2'], 'hello')
  t.equal(Buffer.concat(body).toString('utf8'), 'hello h2!')
})

test('Should handle h2 continue', async t => {
  const requestBody = []
  const server = createSecureServer(pem)
  const responseBody = []

  server.on('request', (request, response) => {
    t.equal(request.headers['x-my-header'], 'foo')
    t.equal(request.headers[':method'], 'POST')

    request.on('data', chunk => requestBody.push(chunk))

    response.writeHead(200, {
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'foo'
    })
    response.end('hello h2!')
  })

  t.plan(8)

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    expectContinue: true
  })

  t.teardown(server.close.bind(server))
  t.teardown(client.close.bind(client))

  const response = await client.request({
    path: '/',
    method: 'POST',
    headers: {
      'x-my-header': 'foo'
    },
    expectContinue: true
  })

  response.body.on('data', chunk => {
    responseBody.push(chunk)
  })

  await once(response.body, 'end')

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.equal(response.headers['x-custom-h2'], 'foo')
  t.equal(Buffer.concat(responseBody).toString('utf-8'), 'hello h2!')
})

test('Should handle h2 request with body (string or buffer)', async t => {
  const server = createSecureServer(pem)
  const responseBody1 = []
  const responseBody2 = []
  const requestBodyString = []
  const requestBodyBuffer = []
  let reqCounter = 0

  server.on('stream', async (stream, headers) => {
    reqCounter++
    if (reqCounter === 1) {
      stream.on('data', chunk => requestBodyString.push(chunk))
    } else {
      stream.on('data', chunk => requestBodyBuffer.push(chunk))
    }

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
      ':status': 200
    })

    stream.end('hello h2!')
  })

  t.plan(10)

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    }
  })

  t.teardown(server.close.bind(server))
  t.teardown(client.close.bind(client))

  const response1 = await client.request({
    path: '/',
    method: 'POST',
    headers: {
      'x-my-header': 'foo'
    },
    body: 'hello from client!'
    // expectContinue: true
  })

  response1.body.on('data', chunk => {
    responseBody1.push(chunk)
  })

  await once(response1.body, 'end')

  const response2 = await client.request({
    path: '/',
    method: 'POST',
    headers: {
      'x-my-header': 'foo'
    },
    body: Buffer.from('hello from client!', 'utf-8')
  })

  response2.body.on('data', chunk => {
    responseBody2.push(chunk)
  })

  await once(response2.body, 'end')

  t.equal(response1.statusCode, 200)
  t.equal(response1.headers['content-type'], 'text/plain; charset=utf-8')
  t.equal(response1.headers['x-custom-h2'], 'foo')
  t.equal(Buffer.concat(responseBody1).toString('utf-8'), 'hello h2!')
  t.equal(
    Buffer.concat(requestBodyString).toString('utf-8'),
    'hello from client!'
  )

  t.equal(response2.statusCode, 200)
  t.equal(response2.headers['content-type'], 'text/plain; charset=utf-8')
  t.equal(response2.headers['x-custom-h2'], 'foo')
  t.equal(Buffer.concat(responseBody2).toString('utf-8'), 'hello h2!')
  t.equal(
    Buffer.concat(requestBodyBuffer).toString('utf-8'),
    'hello from client!'
  )
})

test('Should handle h2 request with body (stream)', async t => {
  const server = createSecureServer(pem)
  const expectedBody = readFileSync(__filename, 'utf-8')
  const stream = createReadStream(__filename)
  const requestChunks = []
  const responseBody = []

  server.on('stream', async (stream, headers) => {
    t.equal(headers[':method'], 'PUT')
    t.equal(headers[':path'], '/')
    t.equal(headers[':scheme'], 'https')

    stream.on('data', chunk => requestChunks.push(chunk))

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
      ':status': 200
    })

    stream.end('hello h2!')
  })

  t.plan(8)

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    }
  })

  t.teardown(server.close.bind(server))
  t.teardown(client.close.bind(client))

  const response = await client.request({
    path: '/',
    method: 'PUT',
    headers: {
      'x-my-header': 'foo'
    },
    body: stream
  })

  response.body.on('data', chunk => {
    responseBody.push(chunk)
  })

  await once(response.body, 'end')

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.equal(response.headers['x-custom-h2'], 'foo')
  t.equal(Buffer.concat(responseBody).toString('utf-8'), 'hello h2!')
  t.equal(Buffer.concat(requestChunks).toString('utf-8'), expectedBody)
})

test('Should handle h2 request with body (iterable)', async t => {
  const server = createSecureServer(pem)
  const expectedBody = 'hello'
  const requestChunks = []
  const responseBody = []
  const iterableBody = {
    [Symbol.iterator]: function * () {
      const end = expectedBody.length - 1
      for (let i = 0; i < end + 1; i++) {
        yield expectedBody[i]
      }

      return expectedBody[end]
    }
  }

  server.on('stream', async (stream, headers) => {
    t.equal(headers[':method'], 'POST')
    t.equal(headers[':path'], '/')
    t.equal(headers[':scheme'], 'https')

    stream.on('data', chunk => requestChunks.push(chunk))

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
      ':status': 200
    })

    stream.end('hello h2!')
  })

  t.plan(8)

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    }
  })

  t.teardown(server.close.bind(server))
  t.teardown(client.close.bind(client))

  const response = await client.request({
    path: '/',
    method: 'POST',
    headers: {
      'x-my-header': 'foo'
    },
    body: iterableBody
  })

  response.body.on('data', chunk => {
    responseBody.push(chunk)
  })

  await once(response.body, 'end')

  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.equal(response.headers['x-custom-h2'], 'foo')
  t.equal(Buffer.concat(responseBody).toString('utf-8'), 'hello h2!')
  t.equal(Buffer.concat(requestChunks).toString('utf-8'), expectedBody)
})
