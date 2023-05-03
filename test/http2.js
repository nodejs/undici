'use strict'

const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const { test, plan } = require('tap')
const pem = require('https-pem')

const { Client } = require('..')

plan(2)

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

test('Should handle h2 request with body (string or buffer)', async t => {
  const server = createSecureServer(pem)
  const responseBody = []
  const requestBody = []

  // server.on('checkContinue', (request, response) => {
  //   t.equal(request.headers['x-my-header'], 'foo')
  //   t.equal(request.headers[':method'], 'POST')

  //   console.log(request)

  //   response.writeContinue()
  // })

  server.on('stream', async (stream, headers) => {
    stream.on('data', chunk => requestBody.push(chunk))

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })

    stream.end('hello h2!')
  })

  t.plan(5)

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
    body: 'hello from client!'
    // expectContinue: true
  })

  response.body.on('data', chunk => {
    responseBody.push(chunk)
  })

  await once(response.body, 'end')
  t.equal(response.statusCode, 200)
  t.equal(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.equal(response.headers['x-custom-h2'], 'hello')
  t.equal(Buffer.concat(responseBody).toString('utf-8'), 'hello h2!')
  t.equal(Buffer.concat(requestBody).toString('utf-8'), 'hello from client!')
})
