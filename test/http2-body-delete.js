'use strict'

const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')
const assert = require('node:assert')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

test('Should handle h2 DELETE request with body', async t => {
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  const expectedBody = '{"ids":[1,2,3]}'
  const requestBody = []
  let contentLengthHeader = null

  server.on('stream', async (stream, headers) => {
    assert.strictEqual(headers[':method'], 'DELETE')
    assert.strictEqual(headers[':path'], '/')
    assert.strictEqual(headers[':scheme'], 'https')

    contentLengthHeader = headers['content-length']

    stream.respond({
      'content-type': 'application/json',
      ':status': 200
    })

    for await (const chunk of stream) {
      requestBody.push(chunk)
    }

    stream.end(JSON.stringify({ deleted: true }))
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
    method: 'DELETE',
    body: expectedBody,
    headers: {
      'content-type': 'application/json'
    }
  })

  assert.strictEqual(response.statusCode, 200)
  // Content-Length header should be sent for DELETE with body
  assert.strictEqual(contentLengthHeader, String(expectedBody.length))
  assert.strictEqual(Buffer.concat(requestBody).toString('utf-8'), expectedBody)

  await response.body.dump()
})

test('Should not send Content-Length for h2 DELETE without body', async t => {
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  let contentLengthHeader = null

  server.on('stream', async (stream, headers) => {
    assert.strictEqual(headers[':method'], 'DELETE')

    contentLengthHeader = headers['content-length']

    stream.respond({
      'content-type': 'application/json',
      ':status': 200
    })

    stream.end(JSON.stringify({ deleted: true }))
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
    method: 'DELETE'
  })

  assert.strictEqual(response.statusCode, 200)
  // Content-Length header should NOT be sent for DELETE without body
  assert.strictEqual(contentLengthHeader, undefined)

  await response.body.dump()
})
