'use strict'

const { test } = require('tap')
const { createServer } = require('http')
const { promisify } = require('util')
const { request, setGlobalDispatcher, MockAgent, Agent } = require('..')
const { getResponse } = require('../lib/mock/mock-utils')
const { kClients } = require('../lib/core/symbols')
const { InvalidArgumentError, ClientClosedError } = require('../lib/core/errors')
const MockClient = require('../lib/mock/mock-client')
const MockPool = require('../lib/mock/mock-pool')
const { kAgent } = require('../lib/mock/mock-symbols')

test('MockAgent - constructor', t => {
  t.plan(4)

  t.test('sets up mock agent', t => {
    t.plan(1)
    t.notThrow(() => new MockAgent())
  })

  t.test('sets up mock agent with single connection', t => {
    t.plan(1)
    t.notThrow(() => new MockAgent({ connections: 1 }))
  })

  t.test('should error passed agent is not valid', t => {
    t.plan(2)
    t.throw(() => new MockAgent({ agent: {} }), new InvalidArgumentError('Argument opts.agent must implement Agent'))
    t.throw(() => new MockAgent({ agent: { dispatch: '' } }), new InvalidArgumentError('Argument opts.agent must implement Agent'))
  })

  t.test('should be able to specify the agent to mock', t => {
    t.plan(1)
    const agent = new Agent()
    t.tearDown(agent.close.bind(agent))
    const mockAgent = new MockAgent({ agent })
    t.tearDown(mockAgent.close.bind(mockAgent))

    t.strictEqual(mockAgent[kAgent], agent)
  })
})

test('MockAgent - get', t => {
  t.plan(3)

  t.test('should return MockClient', (t) => {
    t.plan(1)

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent({ connections: 1 })
    t.tearDown(mockAgent.close.bind(mockAgent))

    const mockClient = mockAgent.get(baseUrl)
    t.true(mockClient instanceof MockClient)
  })

  t.test('should return MockPool', (t) => {
    t.plan(1)

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent()
    t.tearDown(mockAgent.close.bind(mockAgent))

    const mockPool = mockAgent.get(baseUrl)
    t.true(mockPool instanceof MockPool)
  })

  t.test('should return the same instance if already created', (t) => {
    t.plan(1)

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent()
    t.tearDown(mockAgent.close.bind(mockAgent))

    const mockPool1 = mockAgent.get(baseUrl)
    const mockPool2 = mockAgent.get(baseUrl)
    t.strictEqual(mockPool1, mockPool2)
  })
})

test('MockAgent - dispatch', t => {
  t.plan(2)

  t.test('should call the dispatch method of the MockPool', (t) => {
    t.plan(1)

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent()
    t.tearDown(mockAgent.close.bind(mockAgent))

    const mockPool = mockAgent.get(baseUrl)

    mockPool.intercept({
      path: '/foo',
      method: 'GET'
    }).reply(200, 'hello')

    t.notThrow(() => mockAgent.dispatch({
      origin: baseUrl,
      path: '/foo',
      method: 'GET'
    }, {
      onHeaders: (_statusCode, _headers, resume) => resume(),
      onData: () => {},
      onComplete: () => {}
    }))
  })

  t.test('should call the dispatch method of the MockClient', (t) => {
    t.plan(1)

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent({ connections: 1 })
    t.tearDown(mockAgent.close.bind(mockAgent))

    const mockClient = mockAgent.get(baseUrl)

    mockClient.intercept({
      path: '/foo',
      method: 'GET'
    }).reply(200, 'hello')

    t.notThrow(() => mockAgent.dispatch({
      origin: baseUrl,
      path: '/foo',
      method: 'GET'
    }, {
      onHeaders: (_statusCode, _headers, resume) => resume(),
      onData: () => {},
      onComplete: () => {}
    }))
  })
})

test('MockAgent - .close should clean up registered pools or clients', async (t) => {
  t.plan(2)

  const baseUrl = 'http://localhost:9999'

  const mockAgent = new MockAgent()
  t.tearDown(mockAgent.close.bind(mockAgent))

  // Register a pool
  mockAgent.get(baseUrl)

  t.strictEqual(mockAgent[kClients].size, 1)
  await mockAgent.close()
  t.strictEqual(mockAgent[kClients].size, 0)
})

test('MockAgent - basic intercept with request', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))
  const mockPool = mockAgent.get(baseUrl)

  mockPool.intercept({
    path: '/foo?hello=there&see=ya',
    method: 'POST',
    body: 'form1=data1&form2=data2'
  }).reply(200, { foo: 'bar' }, {
    headers: { 'content-type': 'application/json' },
    trailers: { 'Content-MD5': 'test' }
  })

  const { statusCode, headers, trailers, body } = await request(`${baseUrl}/foo?hello=there&see=ya`, {
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
})

test('MockAgent - should support local agents', async (t) => {
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

  const mockAgent = new MockAgent()

  t.tearDown(mockAgent.close.bind(mockAgent))
  const mockPool = mockAgent.get(baseUrl)

  mockPool.intercept({
    path: '/foo?hello=there&see=ya',
    method: 'POST',
    body: 'form1=data1&form2=data2'
  }).reply(200, { foo: 'bar' }, {
    headers: {
      'content-type': 'application/json'
    },
    trailers: { 'Content-MD5': 'test' }
  })

  const { statusCode, headers, trailers, body } = await request(`${baseUrl}/foo?hello=there&see=ya`, {
    method: 'POST',
    body: 'form1=data1&form2=data2',
    dispatcher: mockAgent
  })
  t.strictEqual(statusCode, 200)
  t.strictEqual(headers['content-type'], 'application/json')
  t.deepEqual(trailers, { 'content-md5': 'test' })

  const jsonResponse = JSON.parse(await getResponse(body))
  t.deepEqual(jsonResponse, {
    foo: 'bar'
  })
})

test('MockAgent - should support specifying custom agents to mock', async (t) => {
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

  const agent = new Agent()
  t.tearDown(agent.close.bind(agent))

  const mockAgent = new MockAgent({ agent })
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo?hello=there&see=ya',
    method: 'POST',
    body: 'form1=data1&form2=data2'
  }).reply(200, { foo: 'bar' }, {
    headers: {
      'content-type': 'application/json'
    },
    trailers: { 'Content-MD5': 'test' }
  })

  const { statusCode, headers, trailers, body } = await request(`${baseUrl}/foo?hello=there&see=ya`, {
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
})

test('MockAgent - basic Client intercept with request', async (t) => {
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

  const mockAgent = new MockAgent({ connections: 1 })
  setGlobalDispatcher(mockAgent)
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

  const { statusCode, headers, trailers, body } = await request(`${baseUrl}/foo?hello=there&see=ya`, {
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
})

test('MockAgent - basic intercept with multiple pools', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))
  const mockPool1 = mockAgent.get(baseUrl)
  const mockPool2 = mockAgent.get('http://localhost:9999')

  mockPool1.intercept({
    path: '/foo?hello=there&see=ya',
    method: 'POST',
    body: 'form1=data1&form2=data2'
  }).reply(200, { foo: 'bar-1' }, {
    headers: {
      'content-type': 'application/json'
    },
    trailers: { 'Content-MD5': 'test' }
  })

  mockPool2.intercept({
    path: '/foo?hello=there&see=ya',
    method: 'GET',
    body: 'form1=data1&form2=data2'
  }).reply(200, { foo: 'bar-2' })

  const { statusCode, headers, trailers, body } = await request(`${baseUrl}/foo?hello=there&see=ya`, {
    method: 'POST',
    body: 'form1=data1&form2=data2'
  })
  t.strictEqual(statusCode, 200)
  t.strictEqual(headers['content-type'], 'application/json')
  t.deepEqual(trailers, { 'content-md5': 'test' })

  const jsonResponse = JSON.parse(await getResponse(body))
  t.deepEqual(jsonResponse, {
    foo: 'bar-1'
  })
})

test('MockAgent - should handle multiple responses for an interceptor', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)

  const interceptor = mockPool.intercept({
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

  {
    const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
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
    const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
      method: 'POST'
    })
    t.strictEqual(statusCode, 200)
    t.strictEqual(headers['content-type'], 'application/json')

    const jsonResponse = JSON.parse(await getResponse(body))
    t.deepEqual(jsonResponse, {
      hello: 'there'
    })
  }
})

test('MockAgent - should call original Pool dispatch if request not found', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.strictEqual(statusCode, 200)
  t.strictEqual(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.strictEqual(response, 'hello')
})

test('MockAgent - should call original Client dispatch if request not found', async (t) => {
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

  const mockAgent = new MockAgent({ connections: 1 })
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.strictEqual(statusCode, 200)
  t.strictEqual(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.strictEqual(response, 'hello')
})

test('MockAgent - should handle string responses', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'POST'
  }).reply(200, 'hello')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'POST'
  })
  t.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.strictEqual(response, 'hello')
})

test('MockAgent - should handle basic concurrency for requests', { jobs: 5 }, async (t) => {
  t.plan(5)

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  await Promise.all([...Array(5).keys()].map(idx =>
    t.test(`concurrent job (${idx})`, async (innerTest) => {
      innerTest.plan(2)

      const baseUrl = 'http://localhost:9999'

      const mockPool = mockAgent.get(baseUrl)
      mockPool.intercept({
        path: '/foo',
        method: 'POST'
      }).reply(200, { foo: `bar ${idx}` })

      const { statusCode, body } = await request(`${baseUrl}/foo`, {
        method: 'POST'
      })
      innerTest.strictEqual(statusCode, 200)

      const jsonResponse = JSON.parse(await getResponse(body))
      innerTest.deepEqual(jsonResponse, {
        foo: `bar ${idx}`
      })
    })
  ))
})

test('MockAgent - handle delays to simulate work', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'POST'
  }).reply(200, 'hello').delay(50)

  const start = process.hrtime()

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'POST'
  })
  t.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.strictEqual(response, 'hello')
  const elapsedInMs = process.hrtime(start)[1] / 1e6
  t.true(elapsedInMs >= 50, `Elapsed time is not greater than 50ms: ${elapsedInMs}`)
})

test('MockAgent - should persist requests', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo?hello=there&see=ya',
    method: 'POST',
    body: 'form1=data1&form2=data2'
  }).reply(200, { foo: 'bar' }, {
    headers: {
      'content-type': 'application/json'
    },
    trailers: { 'Content-MD5': 'test' }
  }).persist()

  {
    const { statusCode, headers, trailers, body } = await request(`${baseUrl}/foo?hello=there&see=ya`, {
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
    const { statusCode, headers, trailers, body } = await request(`${baseUrl}/foo?hello=there&see=ya`, {
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
})

test('MockAgent - handle persists with delayed requests', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'POST'
  }).reply(200, 'hello').delay(1).persist()

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'POST'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'hello')
  }

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'POST'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'hello')
  }
})

test('MockAgent - calling close on a mock pool should not affect other mock pools', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPoolToClose = mockAgent.get('http://localhost:9999')
  mockPoolToClose.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'should-not-be-returned')

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')
  mockPool.intercept({
    path: '/bar',
    method: 'POST'
  }).reply(200, 'bar')

  await mockPoolToClose.close()

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  }

  {
    const { statusCode, body } = await request(`${baseUrl}/bar`, {
      method: 'POST'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'bar')
  }
})

test('MockAgent - close removes all registered mock clients', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent({ connections: 1 })
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  await mockAgent.close()
  t.strictEqual(mockAgent[kClients].size, 0)

  try {
    await request(`${baseUrl}/foo`, { method: 'GET' })
  } catch (err) {
    t.true(err instanceof ClientClosedError)
  }
})

test('MockAgent - close removes all registered mock pools', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
    t.fail('should not be called')
    t.end()
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  await mockAgent.close()
  t.strictEqual(mockAgent[kClients].size, 0)

  try {
    await request(`${baseUrl}/foo`, { method: 'GET' })
  } catch (err) {
    t.true(err instanceof ClientClosedError)
  }
})

test('MockAgent - should handle replyWithError', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).replyWithError(new Error('kaboom'))

  await t.rejects(request(`${baseUrl}/foo`, { method: 'GET' }), new Error('kaboom'))
})

test('MockAgent - should support setting a reply to respond a set amount of times', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo').times(2)

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`)
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  }

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`)
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  }

  {
    const { statusCode, headers, body } = await request(`${baseUrl}/foo`)
    t.strictEqual(statusCode, 200)
    t.strictEqual(headers['content-type'], 'text/plain')

    const response = await getResponse(body)
    t.strictEqual(response, 'hello')
  }
})

test('MockAgent - persist overrides times', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo').times(2).persist()

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  }

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  }

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  }
})

test('MockAgent - matcher should not find mock dispatch if path is of unsupported type', async (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    t.strictEqual(req.url, '/foo')
    t.strictEqual(req.method, 'GET')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: {},
    method: 'GET'
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.strictEqual(response, 'hello')
})

test('MockAgent - should match path with regex', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: new RegExp('foo'),
    method: 'GET'
  }).reply(200, 'foo').persist()

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  }

  {
    const { statusCode, body } = await request(`${baseUrl}/hello/foobar`, {
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  }
})

test('MockAgent - should match path with function', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: (value) => value === '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.strictEqual(response, 'foo')
})

test('MockAgent - should match method with regex', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: new RegExp('^GET$')
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.strictEqual(response, 'foo')
})

test('MockAgent - should match method with function', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: (value) => value === 'GET'
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.strictEqual(response, 'foo')
})

test('MockAgent - should match body with regex', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET',
    body: new RegExp('hello')
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET',
    body: 'hello=there'
  })
  t.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.strictEqual(response, 'foo')
})

test('MockAgent - should match body with function', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET',
    body: (value) => value.startsWith('hello')
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET',
    body: 'hello=there'
  })
  t.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.strictEqual(response, 'foo')
})

test('MockAgent - should match url with regex', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(new RegExp(baseUrl))
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.strictEqual(response, 'foo')
})

test('MockAgent - should match url with function', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get((value) => baseUrl === value)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.strictEqual(response, 'foo')
})

test('MockAgent - handle default reply headers', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).defaultReplyHeaders({ foo: 'bar' }).reply(200, 'foo', { headers: { hello: 'there' } })

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.strictEqual(statusCode, 200)
  t.deepEqual(headers, {
    foo: 'bar',
    hello: 'there'
  })

  const response = await getResponse(body)
  t.strictEqual(response, 'foo')
})

test('MockAgent - handle default reply trailers', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).defaultReplyTrailers({ foo: 'bar' }).reply(200, 'foo', { trailers: { hello: 'there' } })

  const { statusCode, trailers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.strictEqual(statusCode, 200)
  t.deepEqual(trailers, {
    foo: 'bar',
    hello: 'there'
  })

  const response = await getResponse(body)
  t.strictEqual(response, 'foo')
})

test('MockAgent - return calculated content-length if specified', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).replyContentLength().reply(200, 'foo', { headers: { hello: 'there' } })

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.strictEqual(statusCode, 200)
  t.deepEqual(headers, {
    hello: 'there',
    'content-length': 3
  })

  const response = await getResponse(body)
  t.strictEqual(response, 'foo')
})

test('MockAgent - return calculated content-length for object response if specified', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).replyContentLength().reply(200, { foo: 'bar' }, { headers: { hello: 'there' } })

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.strictEqual(statusCode, 200)
  t.deepEqual(headers, {
    hello: 'there',
    'content-length': 13
  })

  const jsonResponse = JSON.parse(await getResponse(body))
  t.deepEqual(jsonResponse, { foo: 'bar' })
})

test('MockAgent - should activate and deactivate mock clients', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo').persist()

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  }

  mockAgent.deactivate()

  {
    const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)
    t.strictEqual(headers['content-type'], 'text/plain')

    const response = await getResponse(body)
    t.strictEqual(response, 'hello')
  }

  mockAgent.activate()

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.strictEqual(response, 'foo')
  }
})

test('MockAgent - enableNetConnect should allow all original dispatches to be called if dispatch not found', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  mockAgent.enableNetConnect()

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.strictEqual(statusCode, 200)
  t.strictEqual(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.strictEqual(response, 'hello')
})

test('MockAgent - enableNetConnect with a host string should allow all original dispatches to be called if mockDispatch not found', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  mockAgent.enableNetConnect(`localhost:${server.address().port}`)

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.strictEqual(statusCode, 200)
  t.strictEqual(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.strictEqual(response, 'hello')
})

test('MockAgent - enableNetConnect when called with host string multiple times should allow all original dispatches to be called if mockDispatch not found', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  mockAgent.enableNetConnect('example.com:9999')
  mockAgent.enableNetConnect(`localhost:${server.address().port}`)

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.strictEqual(statusCode, 200)
  t.strictEqual(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.strictEqual(response, 'hello')
})

test('MockAgent - enableNetConnect with a host regex should allow all original dispatches to be called if mockDispatch not found', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  mockAgent.enableNetConnect(new RegExp(`localhost:${server.address().port}`))

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.strictEqual(statusCode, 200)
  t.strictEqual(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.strictEqual(response, 'hello')
})

test('MockAgent - enableNetConnect with a function should allow all original dispatches to be called if mockDispatch not found', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  mockAgent.enableNetConnect((value) => value === `localhost:${server.address().port}`)

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.strictEqual(statusCode, 200)
  t.strictEqual(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.strictEqual(response, 'hello')
})

test('MockAgent - enableNetConnect with an unknown input should throw', async (t) => {
  t.plan(1)

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get('http://localhost:9999')
  mockPool.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  t.throws(() => mockAgent.enableNetConnect({}), new InvalidArgumentError('Unsupported matcher. Must be one of String|Function|RegExp.'))
})

test('MockAgent - disableNetConnect should throw if dispatch not found by net connect', async (t) => {
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

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  mockAgent.disableNetConnect()

  await t.rejects(request(`${baseUrl}/foo`, {
    method: 'GET'
  }), new Error(`Unable to find mock dispatch and real dispatches are disabled for http://localhost:${server.address().port}`))
})
