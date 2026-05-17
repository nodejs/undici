'use strict'

const { createServer } = require('node:http')
const { test, after } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const { Client, interceptors } = require('..')
const { Readable } = require('node:stream')
const { once } = require('node:events')

test('retry with body factory function - stream', async t => {
  t = tspl(t, { plan: 2 })

  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++
    req.on('data', () => {})
    req.on('end', () => {
      if (requestCount < 2) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end('{"message": "failed"}')
      } else {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"message": "success"}')
      }
    })
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(interceptors.retry({
    minTimeout: 100,
    maxTimeout: 100,
    methods: ['POST']
  }))

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'POST',
    path: '/',
    headers: { 'content-type': 'application/json' },
    // Body factory function - creates a new stream for each retry
    body: () => Readable.from(Buffer.from(JSON.stringify({ hello: 'world' })))
  })

  t.equal(response.statusCode, 200)
  t.equal(requestCount, 2, 'server received 2 requests')
})

test('retry with body factory function - async generator', async t => {
  t = tspl(t, { plan: 2 })

  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++
    req.on('data', () => {})
    req.on('end', () => {
      if (requestCount < 2) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end('{"message": "failed"}')
      } else {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"message": "success"}')
      }
    })
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(interceptors.retry({
    minTimeout: 100,
    maxTimeout: 100,
    methods: ['POST']
  }))

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'POST',
    path: '/',
    headers: { 'content-type': 'application/json' },
    // Body factory function returning async generator
    body: () => (async function * () {
      yield '{"hello": "world"}'
    })()
  })

  t.equal(response.statusCode, 200)
  t.equal(requestCount, 2, 'server received 2 requests')
})

test('non-retryable body (regular stream) fails on retry', async t => {
  t = tspl(t, { plan: 2 })

  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end('{"message": "failed"}')
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(interceptors.retry({
    minTimeout: 100,
    maxTimeout: 100,
    methods: ['POST'],
    throwOnError: false
  }))

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    method: 'POST',
    path: '/',
    headers: { 'content-type': 'application/json' },
    body: Readable.from(Buffer.from(JSON.stringify({ hello: 'world' })))
  })

  // The retry should not happen because the stream was consumed,
  // so we should get the 500 response directly
  t.equal(response.statusCode, 500)
  t.equal(requestCount, 1, 'only 1 request sent (stream consumed)')
})
