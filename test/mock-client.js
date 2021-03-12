'use strict'

const { test } = require('tap')
const { createServer } = require('http')
const { promisify } = require('util')
const { Client, MockClient, request } = require('..')
const { getResponse } = require('../lib/mock/mock-utils')
const { kUrl } = require('../lib/core/symbols')
const { kDispatch } = require('../lib/mock/mock-symbols')

test('MockClient - MockClient.dispatch should handle a single interceptor', (t) => {
  t.plan(1)

  const baseUrl = 'http://localhost:9999'
  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))

  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, { foo: 'bar' })

  this[kUrl] = new URL('http://localhost:9999')
  mockClient[kDispatch](new URL('http://localhost:9999'), {
    path: '/foo',
    method: 'GET'
  }, {
    onHeaders: (_statusCode, _headers, resume) => resume(),
    onData: () => {},
    onComplete: () => {}
  })
  t.ok(1)
})

test('ClientMock - basic intercept', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - basic intercept with multiple clients', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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
  const mockClient2 = new MockClient('http://localhost:9999')
  mockClient2.intercept({
    path: '/foo?hello=there&see=ya',
    method: 'GET',
    body: 'form1=data1&form2=data2'
  }).reply(200, { foo: 'bar' })
  t.tearDown(mockClient2.close.bind(mockClient2))

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

test('ClientMock - should support multiple urls', async (t) => {
  t.plan(4)

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

    const mockClient = new MockClient(baseUrl)
    t.tearDown(mockClient.close.bind(mockClient))
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

    const mockClient = new MockClient(baseUrl)
    t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - should select matching subsequent client from multiple MockClients', async (t) => {
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

  const mockClient1 = new MockClient(baseUrl)
  t.tearDown(mockClient1.close.bind(mockClient1))
  mockClient1.intercept({
    path: '/wrong-1',
    method: 'GET'
  }).reply(200, 'wrong-1')

  const mockClient2 = new MockClient(baseUrl)
  t.tearDown(mockClient2.close.bind(mockClient2))
  mockClient2.intercept({
    path: '/wrong-2',
    method: 'GET'
  }).reply(200, 'wrong-2')

  const mockClient3 = new MockClient(baseUrl)
  t.tearDown(mockClient3.close.bind(mockClient3))
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

test('ClientMock - should select first matching client from multiple MockClients', async (t) => {
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

  const mockClient1 = new MockClient(baseUrl)
  t.tearDown(mockClient1.close.bind(mockClient1))
  mockClient1.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  const mockClient2 = new MockClient(baseUrl)
  t.tearDown(mockClient2.close.bind(mockClient2))
  mockClient2.intercept({
    path: '/wrong-2',
    method: 'GET'
  }).reply(200, 'wrong-2')

  const mockClient3 = new MockClient(baseUrl)
  t.tearDown(mockClient3.close.bind(mockClient3))
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

test('ClientMock - basic intercept with request', async (t) => {
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
    t.fail(err.message)
  }
})

test('ClientMock - should handle multiple responses for an interceptor', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - should call original dispatch if request not found', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - should handle string responses', async (t) => {
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
    t.fail(err.message)
  }
})

test('ClientMock - should handle basic concurrency for requests', { jobs: 5 }, async (t) => {
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
        await promisify(setTimeout)(idx)
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

test('ClientMock - handle delays to simulate work', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - handle persists for requests that can be intercepted multiple times', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - should persist requests', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - handle persists for requests that can be intercepted multiple times', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - calling close on a MockClient should not affect other MockClients', async (t) => {
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

  const mockClientToClose = new MockClient(baseUrl)
  t.tearDown(mockClientToClose.close.bind(mockClientToClose))
  mockClientToClose.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'should-not-be-returned')

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')
  mockClient.intercept({
    path: '/bar',
    method: 'POST'
  }).reply(200, 'bar')

  try {
    mockClientToClose.close()
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

test('MockClient - MockClient.closeAll() removes all registered mockDispatches', async (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.strictEqual(req.method, 'GET')
    t.strictEqual(req.url, '/foo')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const client = new Client(baseUrl)
  t.tearDown(client.close.bind(client))

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  try {
    MockClient.closeAll()

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

test('ClientMock - should handle replyWithError', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - should support setting a reply to respond a set amount of times', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - persist overrides times', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - matcher should not find mock dispatch if path is of unsupported type', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - should match path with regex', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - should match path with function', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - should match method with regex', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - should match method with function', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - should match body with regex', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - should match body with function', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - should match url with regex', async (t) => {
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

  const mockClient = new MockClient(new RegExp(baseUrl))
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - should match url with function', async (t) => {
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

  const mockClient = new MockClient((value) => baseUrl === value)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - should be able to turn off mocking with environment variable', async (t) => {
  t.plan(5)

  process.env.UNDICI_CLIENT_MOCK_OFF = 'true'
  t.teardown(() => {
    process.env.UNDICI_CLIENT_MOCK_OFF = 'false'
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - handle default reply headers', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - handle default reply trailers', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - return calculated content-length if specified', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('ClientMock - return calculated content-length for object response if specified', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

test('getAllMocks - returns array of all mock dispatches', async (t) => {
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

  const mockClient1 = new MockClient(baseUrl)
  t.tearDown(mockClient1.close.bind(mockClient1))
  mockClient1.intercept({
    path: '/foo-1',
    method: 'GET'
  }).reply(200, 'foo-1')

  const mockClient2 = new MockClient(baseUrl)
  t.tearDown(mockClient2.close.bind(mockClient2))
  mockClient2.intercept({
    path: '/foo-2',
    method: 'GET'
  }).reply(200, 'foo-2')

  try {
    const result = MockClient.getAllDispatches()

    t.deepEqual(result, [
      {
        url: baseUrl,
        path: '/foo-1',
        method: 'GET',
        body: undefined,
        replies: [
          {
            error: null,
            times: null,
            persist: false,
            consumed: false,
            statusCode: 200,
            data: 'foo-1',
            headers: {},
            trailers: {}
          }
        ]
      },
      {
        url: baseUrl,
        path: '/foo-2',
        method: 'GET',
        body: undefined,
        replies: [
          {
            error: null,
            times: null,
            persist: false,
            consumed: false,
            statusCode: 200,
            data: 'foo-2',
            headers: {},
            trailers: {}
          }
        ]
      }
    ])
  } catch (err) {
    t.fail(err.message)
  }
})

test('ClientMock - should activate and deactivate mocks', async (t) => {
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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
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

    MockClient.deactivate()

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

    MockClient.activate()

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

test('MockClient - MockClient.enableNetConnect() should allow all original dispatches to be called if dispatch not found', async (t) => {
  t.plan(5)
  t.tearDown(() => MockClient.enableNetConnect())

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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
  mockClient.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  try {
    MockClient.enableNetConnect()

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

test('MockClient - MockClient.enableNetConnect() with a host string should allow all original dispatches to be called for a match if dispatch not found', async (t) => {
  t.plan(5)
  t.tearDown(() => MockClient.enableNetConnect())

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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
  mockClient.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  try {
    MockClient.enableNetConnect(`localhost:${server.address().port}`)

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

test('MockClient - MockClient.enableNetConnect() with a host regex should allow all original dispatches to be called for a match if dispatch not found', async (t) => {
  t.plan(5)
  t.tearDown(() => MockClient.enableNetConnect())

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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
  mockClient.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  try {
    MockClient.enableNetConnect(new RegExp(`localhost:${server.address().port}`))

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

test('MockClient - MockClient.enableNetConnect() with a host function should allow all original dispatches to be called for a match if dispatch not found', async (t) => {
  t.plan(5)
  t.tearDown(() => MockClient.enableNetConnect())

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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
  mockClient.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  try {
    MockClient.enableNetConnect((value) => value === `localhost:${server.address().port}`)

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

test('MockClient - disableNetConnect() should force the mockDispatch to error if dispatch not found', async (t) => {
  t.plan(1)
  t.tearDown(() => MockClient.enableNetConnect())

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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
  mockClient.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  try {
    MockClient.disableNetConnect()

    await client.request({
      path: '/foo',
      method: 'GET'
    })
    t.fail('should not complete the request')
  } catch (err) {
    t.strictEqual(err.message, `Unable to find mock dispatch and real dispatches are disabled for host localhost:${server.address().port}`)
  }
})

test('MockClient - MockClient.enableNetConnect() with an unknown input should default to true if dispatch not found', async (t) => {
  t.plan(1)
  t.tearDown(() => MockClient.enableNetConnect())

  const mockClient = new MockClient('http://localhost:9999')
  t.tearDown(mockClient.close.bind(mockClient))
  mockClient.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  try {
    MockClient.enableNetConnect({})

    t.fail('should not complete')
  } catch (err) {
    t.strictEqual(err.message, 'Unsupported matcher. Must be one of String|Function|RegExp.')
  }
})

test('MockClient - MockClient.enableNetConnect() should be called on MockClient.closeAll()', async (t) => {
  t.plan(5)
  t.tearDown(() => MockClient.enableNetConnect())

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

  MockClient.disableNetConnect()

  try {
    MockClient.closeAll()
    const mockClient = new MockClient(baseUrl)
    t.tearDown(mockClient.close.bind(mockClient))
    mockClient.intercept({
      path: '/wrong',
      method: 'GET'
    }).reply(200, 'foo')

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

test('MockClient - MockClient.enableNetConnect() called multiple times with a host string should allow all original dispatches to be called for a match if dispatch not found', async (t) => {
  t.plan(5)
  t.tearDown(() => MockClient.enableNetConnect())

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

  const mockClient = new MockClient(baseUrl)
  t.tearDown(mockClient.close.bind(mockClient))
  mockClient.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  try {
    MockClient.enableNetConnect('example.com:9999')
    MockClient.enableNetConnect(`localhost:${server.address().port}`)

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
