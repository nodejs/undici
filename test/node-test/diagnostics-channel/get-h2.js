'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const diagnosticsChannel = require('node:diagnostics_channel')
const { once } = require('node:events')
const pem = require('https-pem')
const { Client } = require('../../..')

test('Diagnostics channel - get support H2', async t => {
  const server = createSecureServer(pem)

  server.on('stream', (stream, headers, _flags, rawHeaders) => {
    t.strictEqual(headers['x-my-header'], 'foo')
    t.strictEqual(headers[':method'], 'GET')
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
    t.strictEqual(request.origin, `https://localhost:${server.address().port}`)
    t.strictEqual(request.completed, false)
    t.strictEqual(request.method, 'GET')
    t.strictEqual(request.path, '/')
  })

  let _socket
  diagnosticsChannel.channel('undici:client:connected').subscribe(({ socket }) => {
    _socket = socket
  })

  diagnosticsChannel.channel('undici:client:sendHeaders').subscribe(({ headers, socket }) => {
    t.strictEqual(_socket, socket)
    const expectedHeaders = [
      'x-my-header: foo',
      `:authority: localhost:${server.address().port}`,
      ':method: GET',
      ':path: /',
      ':scheme: https'
    ]
    t.strictEqual(headers, expectedHeaders.join('\r\n') + '\r\n')
  })

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  t = tspl(t, { plan: 24 })
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
  t.strictEqual(response.statusCode, 200)
  t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.strictEqual(response.headers['x-custom-h2'], 'hello')
  t.strictEqual(Buffer.concat(body).toString('utf8'), 'hello h2!')

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
  t.strictEqual(response.statusCode, 200)
  t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.strictEqual(response.headers['x-custom-h2'], 'hello')
  t.strictEqual(Buffer.concat(body).toString('utf8'), 'hello h2!')
})
