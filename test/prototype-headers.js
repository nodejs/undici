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
