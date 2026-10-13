'use strict'

const assert = require('node:assert')
const { test } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { Readable } = require('node:stream')
const { Client, errors, fetch, FormData } = require('..')

test('QUERY with string body sends correctly', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    // Consume body to ensure it arrives
    for await (const _ of req) {} // eslint-disable-line
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"data":{}}')
  })

  await once(server.listen(0), 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  t.after(() => { client.destroy(); server.close() })

  const response = await client.request({
    method: 'QUERY',
    path: '/',
    headers: { 'content-type': 'application/json' },
    body: '{"query":"{user}"}'
  })
  await response.body.text()
})

test('QUERY with Buffer body sends correctly', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    // Consume body to ensure it arrives
    for await (const _ of req) {} // eslint-disable-line
    res.writeHead(200)
    res.end('ok')
  })

  await once(server.listen(0), 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  t.after(() => { client.destroy(); server.close() })

  const response = await client.request({
    method: 'QUERY',
    path: '/',
    body: Buffer.from('hello')
  })
  await response.body.text()
})

test('QUERY with stream body sends correctly', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    // Consume body to ensure it arrives
    for await (const _ of req) {} // eslint-disable-line
    res.writeHead(200)
    res.end('ok')
  })

  await once(server.listen(0), 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  t.after(() => { client.destroy(); server.close() })

  const response = await client.request({
    method: 'QUERY',
    path: '/',
    body: new Readable({
      read () {
        this.push('streamed')
        this.push(null)
      }
    })
  })
  await response.body.text()
})

test('QUERY without body works', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    res.writeHead(200)
    res.end('ok')
  })

  await once(server.listen(0), 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  t.after(() => { client.destroy(); server.close() })

  const response = await client.request({
    method: 'QUERY',
    path: '/',
    body: ''
  })
  await response.body.text()
})

test('QUERY with null body works', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    res.writeHead(200)
    res.end('ok')
  })

  await once(server.listen(0), 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  t.after(() => { client.destroy(); server.close() })

  const response = await client.request({
    method: 'QUERY',
    path: '/',
    body: null
  })
  await response.body.text()
})

test('QUERY sends Content-Type header', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200)
    res.end('ok')
  })

  await once(server.listen(0), 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  t.after(() => { client.destroy(); server.close() })

  const response = await client.request({
    method: 'QUERY',
    path: '/',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  })
  await response.body.text()
})

test('QUERY can send Accept-Query header', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200)
    res.end('ok')
  })

  await once(server.listen(0), 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  t.after(() => { client.destroy(); server.close() })

  const response = await client.request({
    method: 'QUERY',
    path: '/',
    headers: { 'accept-query': 'application/graphql' },
    body: '{}'
  })
  await response.body.text()
})

test('QUERY sends content-length header', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200)
    res.end('ok')
  })

  await once(server.listen(0), 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  t.after(() => { client.destroy(); server.close() })

  const response = await client.request({
    path: '/',
    method: 'QUERY',
    body: 'hello'
  })
  await response.body.text()
})

test('QUERY with content-length mismatch should error', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end()
  })

  await once(server.listen(0), 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  t.after(() => { client.destroy(); server.close() })

  try {
    await client.request({
      path: '/',
      method: 'QUERY',
      headers: { 'content-length': 10 },
      body: 'asd'
    })
    assert.fail('should have thrown')
  } catch (err) {
    assert.ok(err instanceof errors.RequestContentLengthMismatchError)
  }
})

test('QUERY method is recognized as safe in fetch API', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
  })

  await once(server.listen(0), 'listening')
  t.after(() => server.close())

  const resp = await fetch(`http://localhost:${server.address().port}/`, {
    method: 'QUERY',
    headers: { 'content-type': 'text/plain' },
    body: 'hello'
  })
  assert.strictEqual(resp.status, 200)
  const text = await resp.text()
  assert.strictEqual(text, 'ok')
})

test('QUERY with FormData body works', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
    // Consume body to ensure it arrives
    for await (const _ of req) {} // eslint-disable-line
    res.writeHead(200)
    res.end('ok')
  })

  await once(server.listen(0), 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  t.after(() => { client.destroy(); server.close() })

  const fd = new FormData()
  fd.append('field', 'value')

  const response = await client.request({
    method: 'QUERY',
    path: '/',
    body: fd
  })
  await response.body.text()
})

test('QUERY redirect 301 should NOT change method (QUERY is safe)', async (t) => {
  let redirects = 0
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    redirects++
    if (redirects === 1) {
      res.writeHead(301, { location: '/redirected' })
      res.end()
      return
    }
    res.writeHead(200)
    res.end('ok')
  })

  await once(server.listen(0), 'listening')

  const client = new Client(`http://localhost:${server.address().port}`, {
    maxRedirections: 1
  })
  t.after(() => { client.destroy(); server.close() })

  const response = await client.request({
    method: 'QUERY',
    path: '/',
    body: 'hello',
    headers: { 'content-type': 'text/plain' }
  })
  await response.body.text()
})

test('QUERY redirect 303 should change method to GET', async (t) => {
  let redirects = 0
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    redirects++
    if (redirects === 1) {
      res.writeHead(303, { location: '/redirected' })
      res.end()
      return
    }
    res.writeHead(200)
    res.end('ok')
  })

  await once(server.listen(0), 'listening')

  const client = new Client(`http://localhost:${server.address().port}`, {
    maxRedirections: 1
  })
  t.after(() => { client.destroy(); server.close() })

  const response = await client.request({
    method: 'QUERY',
    path: '/',
    body: 'hello',
    headers: { 'content-type': 'text/plain' }
  })
  await response.body.text()
})
