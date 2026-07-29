'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

// writeH2() armed the stream timer from bodyTimeout for the whole request, so
// headersTimeout had no effect at all over HTTP/2: a server that accepted the
// stream and never sent headers was only cut off after bodyTimeout.

test('headersTimeout is honoured over HTTP/2', async t => {
  t = tspl(t, { plan: 2 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  // Accept the stream and never respond.
  server.on('stream', (stream) => {
    stream.on('error', () => {})
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: { rejectUnauthorized: false },
    allowH2: true,
    headersTimeout: 200,
    // Much larger, so a failure here means bodyTimeout was used instead.
    bodyTimeout: 5000
  })
  after(() => client.close())

  const start = Date.now()

  await t.rejects(client.request({ path: '/', method: 'GET' }), {
    message: 'HTTP/2: "headers timeout after 200"',
    code: 'UND_ERR_HEADERS_TIMEOUT'
  })

  t.ok(Date.now() - start < 2000, 'must not wait for bodyTimeout')

  await t.completed
})

test('bodyTimeout applies once the response headers arrive', async t => {
  t = tspl(t, { plan: 2 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  // Answer immediately, then stall the body.
  server.on('stream', (stream) => {
    stream.on('error', () => {})
    stream.respond({ ':status': 200 })
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: { rejectUnauthorized: false },
    allowH2: true,
    // Small enough that a request still waiting on headersTimeout would fail
    // the wrong way.
    headersTimeout: 5000,
    bodyTimeout: 200
  })
  after(() => client.close())

  const res = await client.request({ path: '/', method: 'GET' })
  t.strictEqual(res.statusCode, 200)

  await t.rejects(res.body.text(), {
    message: 'HTTP/2: "body timeout after 200"',
    code: 'UND_ERR_BODY_TIMEOUT'
  })

  await t.completed
})
