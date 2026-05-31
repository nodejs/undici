'use strict'

const assert = require('node:assert')
const { test } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

test('Should handle http2 trailers', async t => {
  const server = createSecureServer(pem)
  let client = null

  t.after(async () => {
    await client?.close()
    await new Promise(resolve => server.close(resolve))
  })

  server.on('stream', (stream) => {
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      ':status': 200
    }, {
      waitForTrailers: true
    })

    stream.on('wantTrailers', () => {
      stream.sendTrailers({
        'x-trailer': 'hello'
      })
    })

    stream.end('hello h2!')
  })

  await once(server.listen(0, '127.0.0.1'), 'listening')

  client = new Client(`https://${server.address().address}:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  const { statusCode, headers, body, trailers } = await client.request({
    path: '/',
    method: 'PUT',
    body: 'hello'
  })

  assert.strictEqual(statusCode, 200)
  assert.strictEqual(headers['content-type'], 'text/plain; charset=utf-8')
  assert.strictEqual(await body.text(), 'hello h2!')
  assert.deepStrictEqual(trailers, { 'x-trailer': 'hello' })
})
