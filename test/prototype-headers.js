'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { promisify } = require('node:util')
const net = require('node:net')
const { Client } = require('..')

function createRawServer (response) {
  return net.createServer((socket) => {
    socket.once('data', () => {
      socket.end(response)
    })
  })
}

test('request handles response headers that shadow Object.prototype', async (t) => {
  const server = createRawServer([
    'HTTP/1.1 200 OK',
    '__proto__: pwned',
    'constructor: built-in',
    'content-length: 2',
    'connection: close',
    '',
    'OK'
  ].join('\r\n'))

  t.after(() => {
    server.closeAllConnections?.()
    server.close()
  })

  await promisify(server.listen.bind(server))(0)

  const client = new Client(`http://localhost:${server.address().port}`)
  t.after(() => client.close())

  const { statusCode, headers, body } = await client.request({
    path: '/',
    method: 'GET'
  })

  assert.strictEqual(statusCode, 200)
  assert.strictEqual(Object.getOwnPropertyDescriptor(headers, '__proto__').value, 'pwned')
  assert.strictEqual(Object.getOwnPropertyDescriptor(headers, 'constructor').value, 'built-in')
  assert.strictEqual(await body.text(), 'OK')
})

test('request handles response trailers that shadow Object.prototype', async (t) => {
  const server = createRawServer([
    'HTTP/1.1 200 OK',
    'transfer-encoding: chunked',
    'trailer: __proto__, constructor',
    'connection: close',
    '',
    '2',
    'OK',
    '0',
    '__proto__: trailer',
    'constructor: built-in-trailer',
    '',
    ''
  ].join('\r\n'))

  t.after(() => {
    server.closeAllConnections?.()
    server.close()
  })

  await promisify(server.listen.bind(server))(0)

  const client = new Client(`http://localhost:${server.address().port}`)
  t.after(() => client.close())

  const { statusCode, trailers, body } = await client.request({
    path: '/',
    method: 'GET'
  })

  assert.strictEqual(statusCode, 200)
  assert.strictEqual(await body.text(), 'OK')
  assert.strictEqual(Object.getOwnPropertyDescriptor(trailers, '__proto__').value, 'trailer')
  assert.strictEqual(Object.getOwnPropertyDescriptor(trailers, 'constructor').value, 'built-in-trailer')
})

test('fetch sends a request header named __proto__', async (t) => {
  const { createServer } = require('node:http')
  const { fetch, Headers } = require('..')

  let rawHeaders = null
  const server = createServer((req, res) => {
    rawHeaders = req.rawHeaders
    res.end('OK')
  })

  t.after(() => {
    server.closeAllConnections?.()
    server.close()
  })

  await promisify(server.listen.bind(server))(0)

  const headers = new Headers()
  headers.set('__proto__', 'pwned')
  headers.set('x-control', 'sent')

  const response = await fetch(`http://localhost:${server.address().port}/`, {
    headers
  })
  await response.text()

  const received = {}
  for (let i = 0; i < rawHeaders.length; i += 2) {
    Object.defineProperty(received, rawHeaders[i].toLowerCase(), {
      configurable: true,
      enumerable: true,
      value: rawHeaders[i + 1],
      writable: true
    })
  }

  assert.strictEqual(
    Object.getOwnPropertyDescriptor(received, 'x-control').value,
    'sent'
  )
  assert.strictEqual(
    Object.getOwnPropertyDescriptor(received, '__proto__')?.value,
    'pwned'
  )
})
