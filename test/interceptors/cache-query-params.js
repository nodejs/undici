'use strict'

const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { Client, request, interceptors } = require('../../')

test('query parameters create separate cache entries', async (t) => {
  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++
    const url = new URL(req.url, 'http://localhost')
    const param = url.searchParams.get('param') || 'default'

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=100'
    })
    res.end(JSON.stringify({
      message: `Response for param=${param}`,
      requestNumber: requestCount
    }))
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
    .compose(interceptors.cache())

  after(async () => {
    server.close()
    await client.close()
  })

  const origin = `http://localhost:${server.address().port}`

  // First request with param=value1
  const response1 = await request(origin, {
    dispatcher: client,
    query: { param: 'value1' }
  })
  const body1 = await response1.body.text()
  t.assert.strictEqual(requestCount, 1, 'First request should hit the server')

  // Second request with same param - should be cached
  const response2 = await request(origin, {
    dispatcher: client,
    query: { param: 'value1' }
  })
  const body2 = await response2.body.text()
  t.assert.strictEqual(requestCount, 1, 'Second request with same query should be cached')
  t.assert.strictEqual(body1, body2, 'Cached response should match original')

  // Third request with different param - should NOT be cached
  const response3 = await request(origin, {
    dispatcher: client,
    query: { param: 'value2' }
  })
  const body3 = await response3.body.text()
  t.assert.strictEqual(requestCount, 2, 'Request with different query should hit the server')
  t.assert.notStrictEqual(body1, body3, 'Different query parameters should create separate cache entries')
})

test('complex query parameters are handled correctly', async (t) => {
  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=100'
    })
    res.end(JSON.stringify({
      url: req.url,
      requestNumber: requestCount
    }))
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
    .compose(interceptors.cache())

  after(async () => {
    server.close()
    await client.close()
  })

  const origin = `http://localhost:${server.address().port}`

  // Complex query with arrays and multiple parameters
  const complexQuery = {
    search: 'hello world',
    tags: ['javascript', 'nodejs'],
    limit: 10,
    active: true
  }

  // First request
  const response1 = await request(origin, {
    dispatcher: client,
    query: complexQuery
  })
  const body1 = await response1.body.text()
  t.assert.strictEqual(requestCount, 1, 'First complex query should hit the server')

  // Same complex query - should be cached
  const response2 = await request(origin, {
    dispatcher: client,
    query: complexQuery
  })
  const body2 = await response2.body.text()
  t.assert.strictEqual(requestCount, 1, 'Same complex query should be cached')
  t.assert.strictEqual(body1, body2, 'Complex query parameters should be cached correctly')

  // Slightly different query - should NOT be cached
  const response3 = await request(origin, {
    dispatcher: client,
    query: {
      search: 'hello world',
      tags: ['javascript', 'nodejs'],
      limit: 20, // Different limit
      active: true
    }
  })
  const body3 = await response3.body.text()
  t.assert.strictEqual(requestCount, 2, 'Different complex query should hit the server')
  t.assert.notStrictEqual(body1, body3, 'Different query parameters should create separate cache entries')
})

test('query parameters vs path equivalence', async (t) => {
  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=100'
    })
    res.end(JSON.stringify({
      url: req.url,
      requestNumber: requestCount
    }))
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
    .compose(interceptors.cache())

  after(async () => {
    server.close()
    await client.close()
  })

  const origin = `http://localhost:${server.address().port}`

  // Request using query object
  const response1 = await request(origin, {
    dispatcher: client,
    query: { foo: 'bar', baz: 'qux' }
  })
  const body1 = await response1.body.text()
  t.assert.strictEqual(requestCount, 1, 'Query object request should hit the server')

  // Request using path with query string - should be cached if URLs match
  const response2 = await request(`${origin}/?foo=bar&baz=qux`, {
    dispatcher: client
  })
  const body2 = await response2.body.text()
  t.assert.strictEqual(requestCount, 1, 'Equivalent path query should be cached')
  t.assert.strictEqual(body1, body2, 'Query object and path query should be equivalent')
})

test('empty and undefined query parameters', async (t) => {
  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=100'
    })
    res.end(JSON.stringify({
      url: req.url,
      requestNumber: requestCount
    }))
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
    .compose(interceptors.cache())

  after(async () => {
    server.close()
    await client.close()
  })

  const origin = `http://localhost:${server.address().port}`

  // Request with no query
  const response1 = await request(origin, { dispatcher: client })
  const body1 = await response1.body.text()
  t.assert.strictEqual(requestCount, 1, 'No query request should hit the server')

  // Request with empty query object - should be cached
  const response2 = await request(origin, {
    dispatcher: client,
    query: {}
  })
  const body2 = await response2.body.text()
  t.assert.strictEqual(requestCount, 1, 'Empty query object should be cached')
  t.assert.strictEqual(body1, body2, 'No query and empty query should be equivalent')

  // Request with undefined query - should be cached
  const response3 = await request(origin, {
    dispatcher: client,
    query: undefined
  })
  const body3 = await response3.body.text()
  t.assert.strictEqual(requestCount, 1, 'Undefined query should be cached')
  t.assert.strictEqual(body1, body3, 'No query and undefined query should be equivalent')
})
