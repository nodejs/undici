'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')
const { Readable } = require('node:stream')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

test('Should support H2 connection', async t => {
  t = tspl(t, { plan: 9 })

  const body = []
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  let authority = ''

  server.on('stream', (stream, headers, _flags, rawHeaders) => {
    t.strictEqual(headers['x-my-header'], 'foo')
    t.strictEqual(headers[':method'], 'GET')
    t.strictEqual(headers[':scheme'], 'https')
    t.strictEqual(headers[':path'], '/')
    t.strictEqual(headers[':authority'], authority)
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })
    stream.end('hello h2!')
  })

  after(() => server.close())

  await once(server.listen(0), 'listening')

  authority = `localhost:${server.address().port}`
  const client = new Client(`https://${authority}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
  after(() => client.close())

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

  t.strictEqual(response.statusCode, 200)
  t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.strictEqual(response.headers['x-custom-h2'], 'hello')
  t.strictEqual(Buffer.concat(body).toString('utf8'), 'hello h2!')

  await t.completed
})

test('Should support H2 connection(multiple requests)', async t => {
  t = tspl(t, { plan: 21 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('stream', async (stream, headers, _flags, rawHeaders) => {
    t.strictEqual(headers['x-my-header'], 'foo')
    t.strictEqual(headers[':method'], 'POST')
    const reqData = []
    stream.on('data', chunk => reqData.push(chunk.toString()))
    await once(stream, 'end')
    const reqBody = reqData.join('')
    t.strictEqual(reqBody.length > 0, true)
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })
    stream.end(`hello h2! ${reqBody}`)
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
  after(() => client.close())

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

    t.strictEqual(response.statusCode, 200)
    t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
    t.strictEqual(response.headers['x-custom-h2'], 'hello')
    t.strictEqual(Buffer.concat(body).toString('utf8'), `hello h2! ${sendBody}`)
  }

  await t.completed
})

test('Should support H2 connection (headers as array)', async t => {
  t = tspl(t, { plan: 8 })

  const body = []
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('stream', (stream, headers) => {
    t.strictEqual(headers['x-my-header'], 'foo, bar')
    t.strictEqual(headers['x-my-drink'], 'coffee, tea, water')
    t.strictEqual(headers['x-other'], 'value')
    t.strictEqual(headers[':method'], 'GET')
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })
    stream.end('hello h2!')
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
  after(() => client.close())

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

  t.strictEqual(response.statusCode, 200)
  t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.strictEqual(response.headers['x-custom-h2'], 'hello')
  t.strictEqual(Buffer.concat(body).toString('utf8'), 'hello h2!')

  await t.completed
})

test('Should support multiple header values with semicolon separator', async t => {
  t = tspl(t, { plan: 9 * 2 })

  const body = []
  const body2 = []
  const expectedCookieHeaders = ['a=b', 'c=d', 'e=f']
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('stream', (stream, headers) => {
    t.strictEqual(headers['x-my-header'], 'foo, bar')
    t.strictEqual(headers['x-my-drink'], 'coffee, tea, water')
    t.strictEqual(headers['x-other'], 'value')
    t.strictEqual(headers['cookie'], expectedCookieHeaders.join('; '))
    t.strictEqual(headers[':method'], 'GET')
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })
    stream.end('hello h2!')
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
  after(() => client.close())

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

  t.strictEqual(response.statusCode, 200)
  t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.strictEqual(response.headers['x-custom-h2'], 'hello')
  t.strictEqual(Buffer.concat(body).toString('utf8'), 'hello h2!')

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

  t.strictEqual(response2.statusCode, 200)
  t.strictEqual(response2.headers['content-type'], 'text/plain; charset=utf-8')
  t.strictEqual(response2.headers['x-custom-h2'], 'hello')
  t.strictEqual(Buffer.concat(body).toString('utf8'), 'hello h2!')

  await t.completed
})

test('Should support H2 connection(POST Buffer)', async t => {
  t = tspl(t, { plan: 6 })

  const server = createSecureServer({ ...await pem.generate({ opts: { keySize: 2048 } }), allowHTTP1: false })

  server.on('stream', async (stream, headers, _flags, rawHeaders) => {
    t.strictEqual(headers[':method'], 'POST')
    const reqData = []
    stream.on('data', chunk => reqData.push(chunk.toString()))
    await once(stream, 'end')
    t.strictEqual(reqData.join(''), 'hello!')
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })
    stream.end('hello h2!')
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
  after(() => client.close())

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

  t.strictEqual(response.statusCode, 200)
  t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.strictEqual(response.headers['x-custom-h2'], 'hello')
  t.strictEqual(Buffer.concat(body).toString('utf8'), 'hello h2!')

  await t.completed
})
