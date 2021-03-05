'use strict'

const { test } = require('tap')
const { createServer } = require('http')
const { promisify } = require('util')
const { Client, MockClient, request } = require('..')
const { mockDispatch } = require('../lib/client-mock')
const { kUrl } = require('../lib/core/symbols')

async function getResponse (body) {
  const buffers = []
  for await (const data of body) {
    buffers.push(data)
  }

  return Buffer.concat(buffers).toString('utf8')
}

test('mockDispatch - should handle a single interceptor', (t) => {
  t.plan(1)

  const baseUrl = 'http://localhost:9999'
  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))

  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, { foo: 'bar' })

  this[kUrl] = new URL('http://localhost:9999')
  mockDispatch.bind(this)({
    path: '/foo',
    method: 'GET'
  }, {
    onHeaders: (_statusCode, _headers, resume) => resume(),
    onData: () => {},
    onComplete: () => {}
  })
  t.ok(1)
})

test('ClientMock - basic intercept', (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const baseUrl = `http://localhost:${server.address().port}`

    const client = new Client(baseUrl)
    t.tearDown(client.close.bind(client))

    const mockClient = new MockClient(baseUrl)
    t.tearDown(mockClient.close.bind(mockClient))
    mockClient.intercept({
      path: '/foo',
      method: 'POST'
      // TODO: support query strings
      // query: 'hello=there&see=ya',
      // TODO: support multi-part forms
      // body: 'form=data' // user defined query string to minimize complexity in the MockClient
    }).reply(200, { foo: 'bar' }, {
      headers: {
        'content-type': 'application/json'
      }
    })
    // TODO: add persist as a chained function
    // .persist()

    try {
      const { statusCode, headers, body } = await client.request({
        path: '/foo',
        method: 'POST'
      })
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'application/json')
      // TODO: trailers

      const jsonResponse = JSON.parse(await getResponse(body))
      t.deepEqual(jsonResponse, {
        foo: 'bar'
      })
    } catch (err) {
      t.fail(err)
    }
  })
})

test('ClientMock - basic intercept with request', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const baseUrl = `http://localhost:${server.address().port}`

    const mockClient = new MockClient(baseUrl)
    t.tearDown(mockClient.close.bind(mockClient))
    mockClient.intercept({
      path: '/foo',
      method: 'POST'
    }).reply(200, { foo: 'bar' })

    try {
      const { statusCode, body } = await request(`${baseUrl}/foo`, {
        method: 'POST'
      })
      t.strictEqual(statusCode, 200)

      const jsonResponse = JSON.parse(await getResponse(body))
      t.deepEqual(jsonResponse, {
        foo: 'bar'
      })
    } catch (err) {
      t.fail(err)
    }
  })
})

test('ClientMock - should handle basic concurrency for requests are called in the order of their definition', { jobs: 5 }, async (t) => {
  await Promise.all([...Array(5).keys()].map(idx =>
    t.test(`concurrent job (${idx})`, async (innerTest) => {
      innerTest.plan(2)

      const baseUrl = 'http://localhost:9999'

      const client = new Client(baseUrl)
      innerTest.tearDown(client.close.bind(client))

      const mockClient = new MockClient(baseUrl)
      innerTest.tearDown(mockClient.close.bind(mockClient))
      mockClient.intercept({
        path: '/foo',
        method: 'POST'
      }).reply(200, { foo: `bar ${idx}` })

      try {
        await promisify(setTimeout)(idx * 50)
        const { statusCode, body } = await client.request({
          path: '/foo',
          method: 'POST'
        })
        innerTest.strictEqual(statusCode, 200)

        const jsonResponse = JSON.parse(await getResponse(body))
        innerTest.deepEqual(jsonResponse, {
          foo: `bar ${idx}`
        })
      } catch (err) {
        innerTest.fail(err)
      }
    })
  ))
})

test('ClientMock - should call original dispatch if request not found', (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.strictEqual(req.url, '/wrong')
    t.strictEqual(req.method, 'POST')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const baseUrl = `http://localhost:${server.address().port}`

    const client = new Client(baseUrl)
    t.tearDown(client.close.bind(client))

    const mockClient = new MockClient(baseUrl)
    t.tearDown(mockClient.close.bind(mockClient))
    mockClient.intercept({
      path: '/foo',
      method: 'POST'
    }).reply(200, { foo: 'bar' })

    try {
      const { statusCode, headers, body } = await client.request({
        path: '/wrong',
        method: 'POST'
      })
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')

      const response = await getResponse(body)
      t.strictEqual(response, 'hello')
    } catch (err) {
      t.fail(err)
    }
  })
})

test('ClientMock - should handle string responses', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const baseUrl = `http://localhost:${server.address().port}`

    const client = new Client(baseUrl)
    t.tearDown(client.close.bind(client))

    const mockClient = new MockClient(baseUrl)
    t.tearDown(mockClient.close.bind(mockClient))
    mockClient.intercept({
      path: '/foo',
      method: 'POST'
    }).reply(200, 'hello')

    try {
      const { statusCode, body } = await client.request({
        path: '/foo',
        method: 'POST'
      })
      t.strictEqual(statusCode, 200)

      const response = await getResponse(body)
      t.strictEqual(response, 'hello')
    } catch (err) {
      t.fail(err)
    }
  })
})
