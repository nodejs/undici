'use strict'

const { test } = require('tap')
const { createServer } = require('http')
const { promisify } = require('util')
const { Client, MockClient, cleanAllMocks, request } = require('..')
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
    t.fail(err)
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
    t.fail(err)
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
    t.fail(err)
  }
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

test('ClientMock - should call original dispatch if request not found', async (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.strictEqual(req.url, '/wrong')
    t.strictEqual(req.method, 'POST')
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
    t.fail(err)
  }
})

test('ClientMock - handle delays to simulate work', async (t) => {
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
  }).reply(200, 'hello').delay(100)

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
    t.fail(err)
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
    t.fail(err)
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
    t.fail(err)
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
    t.fail(err)
  }
})

test('ClientMock validation - calling close on a MockClient should not affect other MockClients', async (t) => {
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
    t.fail(err)
  }
})

test('cleanAll - removes all register mockDispatches', async (t) => {
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
    cleanAllMocks()

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
    t.fail(err)
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
