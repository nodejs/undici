'use strict'

const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const diagnosticsChannel = require('node:diagnostics_channel')
const { once } = require('node:events')
const pem = require('@metcoder95/https-pem')
const { Client } = require('../../..')

test('Diagnostics channel - get support H2', async t => {
  const server = createSecureServer(pem)

  server.on('stream', (stream, headers, _flags, rawHeaders) => {
    t.assert.strictEqual(headers['x-my-header'], 'foo')
    t.assert.strictEqual(headers[':method'], 'GET')
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })
    stream.end('hello h2!')
  })

  server.listen(0)
  await once(server, 'listening')

  diagnosticsChannel.channel('undici:request:create').subscribe(({ request }) => {
    t.assert.strictEqual(request.origin, `https://localhost:${server.address().port}`)
    t.assert.strictEqual(request.completed, false)
    t.assert.strictEqual(request.method, 'GET')
    t.assert.strictEqual(request.path, '/')
  })

  let _socket
  diagnosticsChannel.channel('undici:client:connected').subscribe(({ socket }) => {
    _socket = socket
  })

  diagnosticsChannel.channel('undici:client:sendHeaders').subscribe(({ headers, socket }) => {
    t.assert.strictEqual(_socket, socket)
    const expectedHeaders = [
      'x-my-header: foo',
      `:authority: localhost:${server.address().port}`,
      ':method: GET',
      ':path: /',
      ':scheme: https'
    ]
    t.assert.strictEqual(headers, expectedHeaders.join('\r\n') + '\r\n')
  })

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  t.plan(24)
  after(() => server.close())
  after(() => client.close())

  let body = []
  let response = await client.request({
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
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.assert.strictEqual(response.headers['x-custom-h2'], 'hello')
  t.assert.strictEqual(Buffer.concat(body).toString('utf8'), 'hello h2!')

  // request again
  body = []
  response = await client.request({
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
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.assert.strictEqual(response.headers['x-custom-h2'], 'hello')
  t.assert.strictEqual(Buffer.concat(body).toString('utf8'), 'hello h2!')
})
