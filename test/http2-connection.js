'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')
const { Readable } = require('node:stream')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')
const { guardAgainstUnexpectedDisconnect } = require('./utils/h2-disconnect-guard')

// Tears the client down before the server, so the client never has to react to
// a GOAWAY it did not ask for, and waits for both.
function teardown (t, server, getClient) {
  t.after(async () => {
    const client = getClient()
    if (client != null && !client.destroyed) {
      await client.close()
    }
    await new Promise(resolve => server.close(resolve))
  })
}

test('Should support H2 connection', async t => {
  const assert = tspl(t, { plan: 9 })

  const body = []
  const server = createSecureServer(pem)
  let authority = ''
  let client = null

  server.on('stream', (stream, headers, _flags, rawHeaders) => {
    assert.strictEqual(headers['x-my-header'], 'foo')
    assert.strictEqual(headers[':method'], 'GET')
    assert.strictEqual(headers[':scheme'], 'https')
    assert.strictEqual(headers[':path'], '/')
    assert.strictEqual(headers[':authority'], authority)
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })
    stream.end('hello h2!')
  })

  teardown(t, server, () => client)

  await once(server.listen(0, '127.0.0.1'), 'listening')

  authority = `127.0.0.1:${server.address().port}`
  client = new Client(`https://${authority}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  guardAgainstUnexpectedDisconnect(assert, client)

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

  assert.strictEqual(response.statusCode, 200)
  assert.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  assert.strictEqual(response.headers['x-custom-h2'], 'hello')
  assert.strictEqual(Buffer.concat(body).toString('utf8'), 'hello h2!')

  await assert.completed
})

test('Should support H2 connection(multiple requests)', async t => {
  const assert = tspl(t, { plan: 21 })

  const server = createSecureServer(pem)
  let client = null

  server.on('stream', async (stream, headers, _flags, rawHeaders) => {
    assert.strictEqual(headers['x-my-header'], 'foo')
    assert.strictEqual(headers[':method'], 'POST')
    const reqData = []
    stream.on('data', chunk => reqData.push(chunk.toString()))
    await once(stream, 'end')
    const reqBody = reqData.join('')
    assert.strictEqual(reqBody.length > 0, true)
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })
    stream.end(`hello h2! ${reqBody}`)
  })

  teardown(t, server, () => client)

  await once(server.listen(0, '127.0.0.1'), 'listening')

  client = new Client(`https://127.0.0.1:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  guardAgainstUnexpectedDisconnect(assert, client)

  for (let i = 0; i < 3; i++) {
    const sendBody = `seq ${i}`
    const body = []
    const response = await client.request({
      path: '/',
      method: 'POST',
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-my-header': 'foo'
      },
      body: Readable.from(sendBody)
    })

    response.body.on('data', chunk => {
      body.push(chunk)
    })

    await once(response.body, 'end')

    assert.strictEqual(response.statusCode, 200)
    assert.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
    assert.strictEqual(response.headers['x-custom-h2'], 'hello')
    assert.strictEqual(Buffer.concat(body).toString('utf8'), `hello h2! ${sendBody}`)
  }

  await assert.completed
})

test('Should support H2 connection (headers as array)', async t => {
  const assert = tspl(t, { plan: 8 })

  const body = []
  const server = createSecureServer(pem)
  let client = null

  server.on('stream', (stream, headers) => {
    assert.strictEqual(headers['x-my-header'], 'foo, bar')
    assert.strictEqual(headers['x-my-drink'], 'coffee, tea, water')
    assert.strictEqual(headers['x-other'], 'value')
    assert.strictEqual(headers[':method'], 'GET')
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })
    stream.end('hello h2!')
  })

  teardown(t, server, () => client)

  await once(server.listen(0, '127.0.0.1'), 'listening')

  client = new Client(`https://127.0.0.1:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  guardAgainstUnexpectedDisconnect(assert, client)

  const response = await client.request({
    path: '/',
    method: 'GET',
    headers: [
      'x-my-header', 'foo',
      'x-my-drink', ['coffee', 'tea'],
      'x-my-drink', 'water',
      'X-My-Header', 'bar',
      'x-other', 'value'
    ]
  })

  response.body.on('data', chunk => {
    body.push(chunk)
  })

  await once(response.body, 'end')

  assert.strictEqual(response.statusCode, 200)
  assert.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  assert.strictEqual(response.headers['x-custom-h2'], 'hello')
  assert.strictEqual(Buffer.concat(body).toString('utf8'), 'hello h2!')

  await assert.completed
})

test('Should support multiple header values with semicolon separator', async t => {
  const assert = tspl(t, { plan: 9 * 2 })

  const body = []
  const body2 = []
  const expectedCookieHeaders = ['a=b', 'c=d', 'e=f']
  const server = createSecureServer(pem)
  let client = null

  // The two requests carry the same headers by design, so tell their responses
  // apart to keep each assertion pinned to its own response.
  let seq = 0
  server.on('stream', (stream, headers) => {
    const n = ++seq
    assert.strictEqual(headers['x-my-header'], 'foo, bar')
    assert.strictEqual(headers['x-my-drink'], 'coffee, tea, water')
    assert.strictEqual(headers['x-other'], 'value')
    assert.strictEqual(headers.cookie, expectedCookieHeaders.join('; '))
    assert.strictEqual(headers[':method'], 'GET')
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })
    stream.end(`hello h2! ${n}`)
  })

  teardown(t, server, () => client)

  await once(server.listen(0, '127.0.0.1'), 'listening')

  client = new Client(`https://127.0.0.1:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  guardAgainstUnexpectedDisconnect(assert, client)

  const response = await client.request({
    path: '/',
    method: 'GET',
    headers: [
      'x-my-header', 'foo',
      'x-my-drink', ['coffee', 'tea'],
      'x-my-drink', 'water',
      'X-My-Header', 'bar',
      'x-other', 'value',
      'cookie', expectedCookieHeaders
    ]
  })

  response.body.on('data', chunk => {
    body.push(chunk)
  })

  await once(response.body, 'end')

  assert.strictEqual(response.statusCode, 200)
  assert.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  assert.strictEqual(response.headers['x-custom-h2'], 'hello')
  assert.strictEqual(Buffer.concat(body).toString('utf8'), 'hello h2! 1')

  const response2 = await client.request({
    path: '/',
    method: 'GET',
    headers: [
      'x-my-header', 'foo',
      'x-my-drink', ['coffee', 'tea'],
      'cookie', 'a=b',
      'x-my-drink', 'water',
      'X-My-Header', 'bar',
      'cookie', 'c=d',
      'x-other', 'value',
      'cookie', 'e=f'
    ]
  })

  response2.body.on('data', chunk => {
    body2.push(chunk)
  })

  await once(response2.body, 'end')

  assert.strictEqual(response2.statusCode, 200)
  assert.strictEqual(response2.headers['content-type'], 'text/plain; charset=utf-8')
  assert.strictEqual(response2.headers['x-custom-h2'], 'hello')
  assert.strictEqual(Buffer.concat(body2).toString('utf8'), 'hello h2! 2')

  await assert.completed
})

test('Should support H2 connection(POST Buffer)', async t => {
  const assert = tspl(t, { plan: 6 })

  const server = createSecureServer({ key: pem.key, cert: pem.cert, allowHTTP1: false })
  let client = null

  server.on('stream', async (stream, headers, _flags, rawHeaders) => {
    assert.strictEqual(headers[':method'], 'POST')
    const reqData = []
    stream.on('data', chunk => reqData.push(chunk.toString()))
    await once(stream, 'end')
    assert.strictEqual(reqData.join(''), 'hello!')
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })
    stream.end('hello h2!')
  })

  teardown(t, server, () => client)

  await once(server.listen(0, '127.0.0.1'), 'listening')

  client = new Client(`https://127.0.0.1:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  guardAgainstUnexpectedDisconnect(assert, client)

  const sendBody = 'hello!'
  const body = []
  const response = await client.request({
    path: '/',
    method: 'POST',
    body: sendBody
  })

  response.body.on('data', chunk => {
    body.push(chunk)
  })

  await once(response.body, 'end')

  assert.strictEqual(response.statusCode, 200)
  assert.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  assert.strictEqual(response.headers['x-custom-h2'], 'hello')
  assert.strictEqual(Buffer.concat(body).toString('utf8'), 'hello h2!')

  await assert.completed
})
