'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

test('HTTP/2 invalid headers should be recoverable (#4356)', async t => {
  t = tspl(t, { plan: 4 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  let requestCount = 0
  server.on('stream', (stream, headers) => {
    requestCount++
    stream.respond({
      ':status': 200,
      'content-type': 'text/plain'
    })
    stream.end(`response ${requestCount}`)
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

  // First request should succeed
  const response1 = await client.request({
    path: '/',
    method: 'GET'
  })
  const body1 = await response1.body.text()
  t.strictEqual(body1, 'response 1')

  // Second request should also work (client should recover)
  const response2 = await client.request({
    path: '/',
    method: 'GET'
  })
  const body2 = await response2.body.text()
  t.strictEqual(body2, 'response 2')

  // Verify the client is still functional (not crashed)
  t.ok(client instanceof Client, 'client should still be a valid Client instance')
  t.ok(client.destroyed !== undefined, 'client state should be consistent')
})

test('HTTP/2 duplicate headers should be catchable (#4356)', async t => {
  t = tspl(t, { plan: 3 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  let requestCount = 0
  server.on('stream', (stream, headers) => {
    requestCount++
    stream.respond({
      ':status': 200,
      'content-type': 'text/plain'
    })
    stream.end('response')
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

  // Request with duplicate headers (content-type and Content-Type)
  // should throw a catchable error, not an uncaughtException
  try {
    await client.request({
      path: '/',
      method: 'POST',
      headers: {
        'content-type': 'foo/bar',
        'Content-Type': 'foo/bar'
      },
      body: 'foo-bar'
    })
    t.fail('should have thrown')
  } catch (err) {
    t.ok(err.code === 'ERR_HTTP2_INVALID_CONNECTION_HEADERS' ||
         err.code === 'ERR_HTTP2_HEADER_SINGLE_VALUE' ||
         err.code === 'UND_ERR_INFO',
         `expected ERR_HTTP2_INVALID_CONNECTION_HEADERS/ERR_HTTP2_HEADER_SINGLE_VALUE or UND_ERR_INFO, got ${err.code}`)
  }

  // Verify the client is still functional (not crashed)
  t.ok(client instanceof Client, 'client should still be a valid Client instance')

  // After the error, the client should be able to make another request
  // (on a new connection if the session was destroyed)
  const response = await client.request({
    path: '/',
    method: 'GET'
  })
  await response.body.text()
  t.strictEqual(requestCount, 2) // Two successful requests
})
