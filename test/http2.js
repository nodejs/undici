'use strict'

const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const { test } = require('tap')
const pem = require('https-pem')

const { Client } = require('..')

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
