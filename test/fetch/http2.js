'use strict'

const { createSecureServer } = require('node:http2')
const { createReadStream, readFileSync } = require('node:fs')
const { once } = require('node:events')
const { Blob } = require('node:buffer')
const { Readable } = require('node:stream')

const { test, plan } = require('tap')
const pem = require('https-pem')

const { Client, fetch } = require('../..')

const nodeVersion = Number(process.version.split('v')[1].split('.')[0])

plan(5)

test('[Fetch] Simple GET with h2', async t => {
  const server = createSecureServer(pem)
  const expectedRequestBody = 'hello h2!'

  server.on('stream', async (stream, headers) => {
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
      'x-method': headers[':method'],
      ':status': 200
    })

    stream.end(expectedRequestBody)
  })

  t.plan(3)

  server.listen()
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  const response = await fetch(
    `https://localhost:${server.address().port}/`,
    // Needs to be passed to disable the reject unauthorized
    {
      method: 'GET',
      dispatcher: client,
      headers: {
        'x-my-header': 'foo',
        'content-type': 'text-plain'
      }
    }
  )

  const responseBody = await response.text()

  t.teardown(server.close.bind(server))
  t.teardown(client.close.bind(client))

  t.equal(responseBody, expectedRequestBody)
  t.equal(response.headers.get('x-method'), 'GET')
  t.equal(response.headers.get('x-custom-h2'), 'foo')
})

test('[Fetch] Should handle h2 request with body (string or buffer)', async t => {
  const server = createSecureServer(pem)
  const expectedBody = 'hello from client!'
  const expectedRequestBody = 'hello h2!'
  const requestBody = []

  server.on('stream', async (stream, headers) => {
    stream.on('data', chunk => requestBody.push(chunk))

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
      ':status': 200
    })

    stream.end(expectedRequestBody)
  })

  t.plan(2)

  server.listen()
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  const response = await fetch(
    `https://localhost:${server.address().port}/`,
    // Needs to be passed to disable the reject unauthorized
    {
      method: 'POST',
      dispatcher: client,
      headers: {
        'x-my-header': 'foo',
        'content-type': 'text-plain'
      },
      body: expectedBody
    }
  )

  const responseBody = await response.text()

  t.teardown(server.close.bind(server))
  t.teardown(client.close.bind(client))

  t.equal(Buffer.concat(requestBody).toString('utf-8'), expectedBody)
  t.equal(responseBody, expectedRequestBody)
})

// Skipping for now, there is something odd in the way the body is handled
test('[Fetch] Should handle h2 request with body (stream)', { skip: nodeVersion === 16 }, async t => {
  const server = createSecureServer(pem)
  const expectedBody = readFileSync(__filename, 'utf-8')
  const stream = createReadStream(__filename)
  const requestChunks = []

  server.on('stream', async (stream, headers) => {
    t.equal(headers[':method'], 'PUT')
    t.equal(headers[':path'], '/')
    t.equal(headers[':scheme'], 'https')

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
      ':status': 200
    })

    stream.end('hello h2!')

    for await (const chunk of stream) {
      requestChunks.push(chunk)
    }
  })

  t.plan(8)

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  t.teardown(server.close.bind(server))
  t.teardown(client.close.bind(client))

  const response = await fetch(
    `https://localhost:${server.address().port}/`,
    // Needs to be passed to disable the reject unauthorized
    {
      method: 'PUT',
      dispatcher: client,
      headers: {
        'x-my-header': 'foo',
        'content-type': 'text-plain'
      },
      body: Readable.toWeb(stream),
      duplex: 'half'
    }
  )

  const responseBody = await response.text()

  t.equal(response.status, 200)
  t.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8')
  t.equal(response.headers.get('x-custom-h2'), 'foo')
  t.equal(responseBody, 'hello h2!')
  t.equal(Buffer.concat(requestChunks).toString('utf-8'), expectedBody)
})
test('Should handle h2 request with body (Blob)', { skip: !Blob }, async t => {
  const server = createSecureServer(pem)
  const expectedBody = 'asd'
  const requestChunks = []
  const body = new Blob(['asd'], {
    type: 'text/plain'
  })

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
    },
    allowH2: true
  })

  t.teardown(server.close.bind(server))
  t.teardown(client.close.bind(client))

  const response = await fetch(
    `https://localhost:${server.address().port}/`,
    // Needs to be passed to disable the reject unauthorized
    {
      body,
      method: 'POST',
      dispatcher: client,
      headers: {
        'x-my-header': 'foo',
        'content-type': 'text-plain'
      }
    }
  )

  const responseBody = await response.arrayBuffer()

  t.equal(response.status, 200)
  t.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8')
  t.equal(response.headers.get('x-custom-h2'), 'foo')
  t.same(new TextDecoder().decode(responseBody).toString(), 'hello h2!')
  t.equal(Buffer.concat(requestChunks).toString('utf-8'), expectedBody)
})

test(
  'Should handle h2 request with body (Blob:ArrayBuffer)',
  { skip: !Blob },
  async t => {
    const server = createSecureServer(pem)
    const expectedBody = 'hello'
    const requestChunks = []
    const expectedResponseBody = { hello: 'h2' }
    const buf = Buffer.from(expectedBody)
    const body = new ArrayBuffer(buf.byteLength)

    buf.copy(new Uint8Array(body))

    server.on('stream', async (stream, headers) => {
      t.equal(headers[':method'], 'PUT')
      t.equal(headers[':path'], '/')
      t.equal(headers[':scheme'], 'https')

      stream.on('data', chunk => requestChunks.push(chunk))

      stream.respond({
        'content-type': 'application/json',
        'x-custom-h2': headers['x-my-header'],
        ':status': 200
      })

      stream.end(JSON.stringify(expectedResponseBody))
    })

    t.plan(8)

    server.listen(0)
    await once(server, 'listening')

    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: {
        rejectUnauthorized: false
      },
      allowH2: true
    })

    t.teardown(server.close.bind(server))
    t.teardown(client.close.bind(client))

    const response = await fetch(
      `https://localhost:${server.address().port}/`,
      // Needs to be passed to disable the reject unauthorized
      {
        body,
        method: 'PUT',
        dispatcher: client,
        headers: {
          'x-my-header': 'foo',
          'content-type': 'text-plain'
        }
      }
    )

    const responseBody = await response.json()

    t.equal(response.status, 200)
    t.equal(response.headers.get('content-type'), 'application/json')
    t.equal(response.headers.get('x-custom-h2'), 'foo')
    t.same(responseBody, expectedResponseBody)
    t.equal(Buffer.concat(requestChunks).toString('utf-8'), expectedBody)
  }
)
