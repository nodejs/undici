'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

test('Should handle h2 continue', async t => {
  t = tspl(t, { plan: 7 })

  const requestBody = []
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }), () => {})
  const responseBody = []

  server.on('checkContinue', (request, response) => {
    t.strictEqual(request.headers.expect, '100-continue')
    t.strictEqual(request.headers['x-my-header'], 'foo')
    t.strictEqual(request.headers[':method'], 'POST')
    response.writeContinue()

    request.on('data', chunk => requestBody.push(chunk))

    response.writeHead(200, {
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'foo'
    })
    response.end('hello h2!')
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    expectContinue: true,
    allowH2: true
  })
  after(() => client.close())

  client.on('disconnect', () => {
    if (!client.closed && !client.destroyed) {
      t.fail('unexpected disconnect')
    }
  })

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

  t.strictEqual(response.statusCode, 200)
  t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.strictEqual(response.headers['x-custom-h2'], 'foo')
  t.strictEqual(Buffer.concat(responseBody).toString('utf-8'), 'hello h2!')

  await t.completed
})

test('Should deliver an early final response to an Expect: 100-continue request without sending the body', async t => {
  t = tspl(t, { plan: 4 })

  let requestBodyBytes = 0
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }), () => {})

  server.on('checkContinue', (request, response) => {
    t.strictEqual(request.headers.expect, '100-continue')
    request.on('data', chunk => { requestBodyBytes += chunk.length })

    // Answer from the header fields alone; do not send 100 (Continue).
    response.writeHead(401, { 'content-type': 'text/plain' })
    response.end('denied')
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

  client.on('disconnect', () => {
    if (!client.closed && !client.destroyed) {
      t.fail('unexpected disconnect')
    }
  })

  const response = await client.request({
    path: '/',
    method: 'POST',
    headers: {
      'content-type': 'text/plain'
    },
    body: 'x'.repeat(1024),
    expectContinue: true
  })

  t.strictEqual(response.statusCode, 401)
  t.strictEqual(await response.body.text(), 'denied')
  t.strictEqual(requestBodyBytes, 0)

  await t.completed
})
