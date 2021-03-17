'use strict'

const { test } = require('tap')
const { createServer } = require('http')
const { promisify } = require('util')
const { Client, MockAgent } = require('..')
const { getResponse } = require('../lib/mock/mock-utils')
const { kUrl } = require('../lib/core/symbols')
const { kDispatch, kDispatches } = require('../lib/mock/mock-symbols')
const MockClient = require('../lib/mock/mock-client')
const { InvalidArgumentError } = require('../lib/core/errors')

test('MockClient - constructor', t => {
  t.plan(2)

  t.test('fails if opts.agent does not implement `get` method', t => {
    t.plan(1)
    t.throw(() => new MockClient('http://localhost:9999', { agent: { get: 'not a function' } }), InvalidArgumentError)
  })

  t.test('sets agent', t => {
    t.plan(1)
    const mockAgent = new MockAgent({ connections: 1 })
    t.tearDown(mockAgent.close.bind(mockAgent))

    t.notThrow(() => new MockClient('http://localhost:9999', { agent: new MockAgent({ connections: 1 }) }))
  })
})

test('MockClient - [kDispatch] should handle a single interceptor', async (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent({ connections: 1 })

  t.tearDown(mockAgent.close.bind(mockAgent))
  const mockClient = mockAgent.get(baseUrl)

  try {
    this[kUrl] = new URL('http://localhost:9999')
    this[kDispatches] = [
      {
        path: '/foo',
        method: 'GET',
        data: {
          statusCode: 200,
          data: 'hello',
          headers: {},
          trailers: {},
          error: null
        }
      }
    ]
    const result = mockClient[kDispatch].call(this, {
      path: '/foo',
      method: 'GET'
    }, {
      onHeaders: (_statusCode, _headers, resume) => resume(),
      onData: () => {},
      onComplete: () => {}
    })
    t.strictEqual(result, true)
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - basic intercept', async (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)

  mockClient.intercept({
    path: '/foo?hello=there&see=ya',
    method: 'POST',
    body: 'form1=data1&form2=data2'
  }).reply(200, { foo: 'bar' }, {
    headers: {
      'content-type': 'application/json'
    },
    trailers: { 'Content-MD5': 'test' }
  })

  try {
    const { statusCode, headers, trailers, body } = await client.request({
      path: '/foo?hello=there&see=ya',
      method: 'POST',
      body: 'form1=data1&form2=data2'
    })
    t.strictEqual(statusCode, 200)
    t.strictEqual(headers['content-type'], 'application/json')
    t.deepEqual(trailers, { 'content-md5': 'test' })

    const jsonResponse = JSON.parse(await getResponse(body))
    t.deepEqual(jsonResponse, {
      foo: 'bar'
    })
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - basic intercept with multiple clients', async (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))
  const mockClient1 = mockAgent.get(baseUrl)
  const mockClient2 = mockAgent.get('http://localhost:9999')

  mockClient1.intercept({
    path: '/foo?hello=there&see=ya',
    method: 'POST',
    body: 'form1=data1&form2=data2'
  }).reply(200, { foo: 'bar' }, {
    headers: {
      'content-type': 'application/json'
    },
    trailers: { 'Content-MD5': 'test' }
  })

  mockClient2.intercept({
    path: '/foo?hello=there&see=ya',
    method: 'GET',
    body: 'form1=data1&form2=data2'
  }).reply(200, { foo: 'bar' })

  try {
    const { statusCode, headers, trailers, body } = await client.request({
      path: '/foo?hello=there&see=ya',
      method: 'POST',
      body: 'form1=data1&form2=data2'
    })
    t.strictEqual(statusCode, 200)
    t.strictEqual(headers['content-type'], 'application/json')
    t.deepEqual(trailers, { 'content-md5': 'test' })

    const jsonResponse = JSON.parse(await getResponse(body))
    t.deepEqual(jsonResponse, {
      foo: 'bar'
    })
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - should support multiple urls', async (t) => {
  t.plan(4)

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  {
    const server = createServer((req, res) => {
      res.setHeader('content-type', 'text/plain')
      res.end('should not be called')
      t.fail('should not be called')
      t.end()
    })
    t.tearDown(server.close.bind(server))

    await promisify(server.listen.bind(server))(0)
    const baseUrl = `http://localhost:${server.address().port}`

    const client = new Client(baseUrl)
    t.tearDown(client.close.bind(client))

    const mockClient = mockAgent.get(baseUrl)
    mockClient.intercept({
      path: '/foo',
      method: 'GET'
    }).reply(200, { foo: 'bar' })

    try {
      const { statusCode, body } = await client.request({
        path: '/foo',
        method: 'GET'
      })
      t.strictEqual(statusCode, 200)

      const jsonResponse = JSON.parse(await getResponse(body))
      t.deepEqual(jsonResponse, {
        foo: 'bar'
      })
    } catch (err) {
      t.fail(err.message)
    }
  }

  {
    const server = createServer((req, res) => {
      res.setHeader('content-type', 'text/plain')
      res.end('should not be called')
      t.fail('should not be called')
      t.end()
    })
    t.tearDown(server.close.bind(server))

    await promisify(server.listen.bind(server))(0)
    const baseUrl = `http://localhost:${server.address().port}`

    const client = new Client(baseUrl)
    t.tearDown(client.close.bind(client))

    const mockClient = mockAgent.get(baseUrl)
    mockClient.intercept({
      path: '/bar',
      method: 'POST'
    }).reply(200, { foo: 'bar' })

    try {
      const { statusCode, body } = await client.request({
        path: '/bar',
        method: 'POST'
      })
      t.strictEqual(statusCode, 200)

      const jsonResponse = JSON.parse(await getResponse(body))
      t.deepEqual(jsonResponse, {
        foo: 'bar'
      })
    } catch (err) {
      t.fail(err.message)
    }
  }
})

test('MockClient - should select first matching client from multiple intercepts on the same client', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)
  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockClient1 = mockAgent.get(baseUrl)
  mockClient1.intercept({
    path: '/wrong-1',
    method: 'GET'
  }).reply(200, 'wrong-1')

  const mockClient2 = mockAgent.get(baseUrl)
  mockClient2.intercept({
    path: '/wrong-2',
    method: 'GET'
  }).reply(200, 'wrong-2')

  const mockClient3 = mockAgent.get(baseUrl)
  mockClient3.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  try {
    const { statusCode, body } = await client.request({
      path: '/foo',
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - should handle multiple responses for an interceptor', async (t) => {
  t.plan(6)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockClient = mockAgent.get(baseUrl)

  const interceptor = mockClient.intercept({
    path: '/foo',
    method: 'POST'
  })
  interceptor.reply(200, { foo: 'bar' }, {
    headers: {
      'content-type': 'application/json'
    }
  })
  interceptor.reply(200, { hello: 'there' }, {
    headers: {
      'content-type': 'application/json'
    }
  })

  try {
    {
      const { statusCode, headers, body } = await client.request({
        path: '/foo',
        method: 'POST'
      })
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'application/json')

      const jsonResponse = JSON.parse(await getResponse(body))
      t.deepEqual(jsonResponse, {
        foo: 'bar'
      })
    }

    {
      const { statusCode, headers, body } = await client.request({
        path: '/foo',
        method: 'POST'
      })
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'application/json')

      const jsonResponse = JSON.parse(await getResponse(body))
      t.deepEqual(jsonResponse, {
        hello: 'there'
      })
    }
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - should call original dispatch if request not found', async (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.strictEqual(req.url, '/foo')
    t.strictEqual(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, { foo: 'bar' })

  try {
    const { statusCode, headers, body } = await client.request({
      path: '/foo',
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)
    t.strictEqual(headers['content-type'], 'text/plain')

    const response = await getResponse(body)
    t.strictEqual(response, 'hello')
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - should handle string responses', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
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
    t.fail(err.message)
  }
})

test('MockClient - should handle basic concurrency for requests', { jobs: 5 }, async (t) => {
  t.plan(5)

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  await Promise.all([...Array(5).keys()].map(idx =>
    t.test(`concurrent job (${idx})`, async (innerTest) => {
      innerTest.plan(2)

      const baseUrl = 'http://localhost:9999'

      const client = new Client(baseUrl)
      innerTest.tearDown(client.close.bind(client))

      const mockClient = mockAgent.get(baseUrl)
      mockClient.intercept({
        path: '/foo',
        method: 'POST'
      }).reply(200, { foo: `bar ${idx}` })

      try {
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
        innerTest.fail(err.message)
      }
    })
  ))
})

test('MockClient - handle delays to simulate work', async (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/foo',
    method: 'POST'
  }).reply(200, 'hello').delay(50)

  try {
    const start = process.hrtime()

    const { statusCode, body } = await client.request({
      path: '/foo',
      method: 'POST'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'hello')
    const elapsedInMs = process.hrtime(start)[1] / 1e6
    t.true(elapsedInMs >= 50, `Elapsed time is not greater than 50ms: ${elapsedInMs}`)
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - should persist requests', async (t) => {
  t.plan(8)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)

  mockClient.intercept({
    path: '/foo?hello=there&see=ya',
    method: 'POST',
    body: 'form1=data1&form2=data2'
  }).reply(200, { foo: 'bar' }, {
    headers: {
      'content-type': 'application/json'
    },
    trailers: { 'Content-MD5': 'test' }
  }).persist()

  try {
    {
      const { statusCode, headers, trailers, body } = await client.request({
        path: '/foo?hello=there&see=ya',
        method: 'POST',
        body: 'form1=data1&form2=data2'
      })
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'application/json')
      t.deepEqual(trailers, { 'content-md5': 'test' })

      const jsonResponse = JSON.parse(await getResponse(body))
      t.deepEqual(jsonResponse, {
        foo: 'bar'
      })
    }

    {
      const { statusCode, headers, trailers, body } = await client.request({
        path: '/foo?hello=there&see=ya',
        method: 'POST',
        body: 'form1=data1&form2=data2'
      })
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'application/json')
      t.deepEqual(trailers, { 'content-md5': 'test' })

      const jsonResponse = JSON.parse(await getResponse(body))
      t.deepEqual(jsonResponse, {
        foo: 'bar'
      })
    }
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - handle persists with delayed requests', async (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/foo',
    method: 'POST'
  }).reply(200, 'hello').delay(1).persist()

  try {
    {
      const { statusCode, body } = await client.request({
        path: '/foo',
        method: 'POST'
      })
      t.strictEqual(statusCode, 200)

      const response = await getResponse(body)
      t.strictEqual(response, 'hello')
    }

    {
      const { statusCode, body } = await client.request({
        path: '/foo',
        method: 'POST'
      })
      t.strictEqual(statusCode, 200)

      const response = await getResponse(body)
      t.strictEqual(response, 'hello')
    }
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - calling close on a MockClient should not affect other MockClients', async (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClientToClose = mockAgent.get('http://localhost:9999')
  mockClientToClose.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'should-not-be-returned')

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')
  mockClient.intercept({
    path: '/bar',
    method: 'POST'
  }).reply(200, 'bar')

  try {
    await mockClientToClose.close()

    {
      const { statusCode, body } = await client.request({
        path: '/foo',
        method: 'GET'
      })
      t.strictEqual(statusCode, 200)

      const response = await getResponse(body)
      t.strictEqual(response, 'foo')
    }

    {
      const { statusCode, body } = await client.request({
        path: '/bar',
        method: 'POST'
      })
      t.strictEqual(statusCode, 200)

      const response = await getResponse(body)
      t.strictEqual(response, 'bar')
    }
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - should handle replyWithError', async (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).replyWithError(new Error('kaboom'))

  try {
    await client.request({ path: '/foo', method: 'GET' })

    t.fail('should not be called')
  } catch (err) {
    t.strictEqual(err.message, 'kaboom')
  }
})

test('MockClient - should support setting a reply to respond a set amount of times', async (t) => {
  t.plan(9)

  const server = createServer((req, res) => {
    t.strictEqual(req.url, '/foo')
    t.strictEqual(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo').times(2)

  try {
    {
      const { statusCode, body } = await client.request({
        path: '/foo',
        method: 'GET'
      })
      t.strictEqual(statusCode, 200)

      const response = await getResponse(body)
      t.strictEqual(response, 'foo')
    }

    {
      const { statusCode, body } = await client.request({
        path: '/foo',
        method: 'GET'
      })
      t.strictEqual(statusCode, 200)

      const response = await getResponse(body)
      t.strictEqual(response, 'foo')
    }

    {
      const { statusCode, headers, body } = await client.request({
        path: '/foo',
        method: 'GET'
      })
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')

      const response = await getResponse(body)
      t.strictEqual(response, 'hello')
    }
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - persist overrides times', async (t) => {
  t.plan(6)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo').times(2).persist()

  try {
    {
      const { statusCode, body } = await client.request({
        path: '/foo',
        method: 'GET'
      })
      t.strictEqual(statusCode, 200)

      const response = await getResponse(body)
      t.strictEqual(response, 'foo')
    }

    {
      const { statusCode, body } = await client.request({
        path: '/foo',
        method: 'GET'
      })
      t.strictEqual(statusCode, 200)

      const response = await getResponse(body)
      t.strictEqual(response, 'foo')
    }

    {
      const { statusCode, body } = await client.request({
        path: '/foo',
        method: 'GET'
      })
      t.strictEqual(statusCode, 200)

      const response = await getResponse(body)
      t.strictEqual(response, 'foo')
    }
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - matcher should not find mock dispatch if path is of unsupported type', async (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    t.strictEqual(req.url, '/foo')
    t.strictEqual(req.method, 'GET')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: {},
    method: 'GET'
  }).reply(200, 'foo')

  try {
    const { statusCode, body } = await client.request({
      path: '/foo',
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'hello')
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - should match path with regex', async (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: new RegExp('foo'),
    method: 'GET'
  }).reply(200, 'foo').persist()

  try {
    {
      const { statusCode, body } = await client.request({
        path: '/foo',
        method: 'GET'
      })
      t.strictEqual(statusCode, 200)

      const response = await getResponse(body)
      t.strictEqual(response, 'foo')
    }

    {
      const { statusCode, body } = await client.request({
        path: '/hello/foobar',
        method: 'GET'
      })
      t.strictEqual(statusCode, 200)

      const response = await getResponse(body)
      t.strictEqual(response, 'foo')
    }
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - should match path with function', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: (value) => value === '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  try {
    const { statusCode, body } = await client.request({
      path: '/foo',
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - should match method with regex', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/foo',
    method: new RegExp('^GET$')
  }).reply(200, 'foo')

  try {
    const { statusCode, body } = await client.request({
      path: '/foo',
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - should match method with function', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/foo',
    method: (value) => value === 'GET'
  }).reply(200, 'foo')

  try {
    const { statusCode, body } = await client.request({
      path: '/foo',
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - should match body with regex', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/foo',
    method: 'GET',
    body: new RegExp('hello')
  }).reply(200, 'foo')

  try {
    const { statusCode, body } = await client.request({
      path: '/foo',
      method: 'GET',
      body: 'hello=there'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - should match body with function', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/foo',
    method: 'GET',
    body: (value) => value.startsWith('hello')
  }).reply(200, 'foo')

  try {
    const { statusCode, body } = await client.request({
      path: '/foo',
      method: 'GET',
      body: 'hello=there'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - should match url with regex', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(new RegExp(baseUrl))
  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  try {
    const { statusCode, body } = await client.request({
      path: '/foo',
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - should match url with function', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get((value) => baseUrl === value)
  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  try {
    const { statusCode, body } = await client.request({
      path: '/foo',
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - handle default reply headers', async (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).defaultReplyHeaders({ foo: 'bar' }).reply(200, 'foo', { headers: { hello: 'there' } })

  try {
    const { statusCode, headers, body } = await client.request({
      path: '/foo',
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)
    t.deepEqual(headers, {
      foo: 'bar',
      hello: 'there'
    })

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - handle default reply trailers', async (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).defaultReplyTrailers({ foo: 'bar' }).reply(200, 'foo', { trailers: { hello: 'there' } })

  try {
    const { statusCode, trailers, body } = await client.request({
      path: '/foo',
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)
    t.deepEqual(trailers, {
      foo: 'bar',
      hello: 'there'
    })

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - return calculated content-length if specified', async (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).replyContentLength().reply(200, 'foo', { headers: { hello: 'there' } })

  try {
    const { statusCode, headers, body } = await client.request({
      path: '/foo',
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)
    t.deepEqual(headers, {
      hello: 'there',
      'content-length': 3
    })

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - return calculated content-length for object response if specified', async (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).replyContentLength().reply(200, { foo: 'bar' }, { headers: { hello: 'there' } })

  try {
    const { statusCode, headers, body } = await client.request({
      path: '/foo',
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)
    t.deepEqual(headers, {
      hello: 'there',
      'content-length': 13
    })

    const jsonResponse = JSON.parse(await getResponse(body))
    t.deepEqual(jsonResponse, { foo: 'bar' })
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - should activate and deactivate mock clients', async (t) => {
  t.plan(9)

  const server = createServer((req, res) => {
    t.strictEqual(req.url, '/foo')
    t.strictEqual(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo').persist()

  try {
    {
      const { statusCode, body } = await client.request({
        path: '/foo',
        method: 'GET'
      })
      t.strictEqual(statusCode, 200)

      const response = await getResponse(body)
      t.strictEqual(response, 'foo')
    }

    mockAgent.deactivate()

    {
      const { statusCode, headers, body } = await client.request({
        path: '/foo',
        method: 'GET'
      })
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')

      const response = await getResponse(body)
      t.strictEqual(response, 'hello')
    }

    mockAgent.activate()

    {
      const { statusCode, body } = await client.request({
        path: '/foo',
        method: 'GET'
      })
      t.strictEqual(statusCode, 200)

      const response = await getResponse(body)
      t.strictEqual(response, 'foo')
    }
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - enableNetConnect should allow all original dispatches to be called if dispatch not found', async (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.strictEqual(req.url, '/foo')
    t.strictEqual(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  try {
    mockAgent.enableNetConnect()

    const { statusCode, headers, body } = await client.request({
      path: '/foo',
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)
    t.strictEqual(headers['content-type'], 'text/plain')

    const response = await getResponse(body)
    t.strictEqual(response, 'hello')
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - enableNetConnect with a host string should allow all original dispatches to be called if mockDispatch not found', async (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.strictEqual(req.url, '/foo')
    t.strictEqual(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  try {
    mockAgent.enableNetConnect(`localhost:${server.address().port}`)

    const { statusCode, headers, body } = await client.request({
      path: '/foo',
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)
    t.strictEqual(headers['content-type'], 'text/plain')

    const response = await getResponse(body)
    t.strictEqual(response, 'hello')
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - enableNetConnect when called with host string multiple times should allow all original dispatches to be called if mockDispatch not found', async (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.strictEqual(req.url, '/foo')
    t.strictEqual(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  try {
    mockAgent.enableNetConnect('example.com:9999')
    mockAgent.enableNetConnect(`localhost:${server.address().port}`)

    const { statusCode, headers, body } = await client.request({
      path: '/foo',
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)
    t.strictEqual(headers['content-type'], 'text/plain')

    const response = await getResponse(body)
    t.strictEqual(response, 'hello')
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - enableNetConnect with a host regex should allow all original dispatches to be called if mockDispatch not found', async (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.strictEqual(req.url, '/foo')
    t.strictEqual(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  try {
    mockAgent.enableNetConnect(new RegExp(`localhost:${server.address().port}`))

    const { statusCode, headers, body } = await client.request({
      path: '/foo',
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)
    t.strictEqual(headers['content-type'], 'text/plain')

    const response = await getResponse(body)
    t.strictEqual(response, 'hello')
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - enableNetConnect with a function should allow all original dispatches to be called if mockDispatch not found', async (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.strictEqual(req.url, '/foo')
    t.strictEqual(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  try {
    mockAgent.enableNetConnect((value) => value === `localhost:${server.address().port}`)

    const { statusCode, headers, body } = await client.request({
      path: '/foo',
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)
    t.strictEqual(headers['content-type'], 'text/plain')

    const response = await getResponse(body)
    t.strictEqual(response, 'hello')
  } catch (err) {
    t.fail(err.message)
  }
})

test('MockClient - enableNetConnect with an unknown input should throw', async (t) => {
  t.plan(1)

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get('http://localhost:9999')
  mockClient.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  try {
    mockAgent.enableNetConnect({})

    t.fail('should not complete')
  } catch (err) {
    t.strictEqual(err.message, 'Unsupported matcher. Must be one of String|Function|RegExp.')
  }
})

test('MockClient - disableNetConnect should throw if dispatch not found by net connect', async (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    t.strictEqual(req.url, '/foo')
    t.strictEqual(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  try {
    mockAgent.disableNetConnect()

    await client.request({
      path: '/foo',
      method: 'GET'
    })
    t.fail('should not complete the request')
  } catch (err) {
    t.strictEqual(err.message, `Unable to find mock dispatch and real dispatches are disabled for http://localhost:${server.address().port}`)
  }
})

test('MockClient - should be able to turn off mocking with environment variable', async (t) => {
  t.plan(5)

  process.env.UNDICI_MOCK_OFF = 'true'
  t.teardown(() => {
    process.env.UNDICI_MOCK_OFF = 'false'
  })

  const server = createServer((req, res) => {
    t.strictEqual(req.url, '/foo')
    t.strictEqual(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  try {
    const { statusCode, headers, body } = await client.request({
      path: '/foo',
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)
    t.strictEqual(headers['content-type'], 'text/plain')

    const response = await getResponse(body)
    t.strictEqual(response, 'hello')
  } catch (err) {
    t.fail(err.message)
  }
})
