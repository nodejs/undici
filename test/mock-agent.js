'use strict'

const { test } = require('tap')
const { createServer } = require('http')
const { promisify } = require('util')
const { request, setGlobalDispatcher, MockAgent, Agent } = require('..')
const { getResponse } = require('../lib/mock/mock-utils')
const { kClients, kConnected } = require('../lib/core/symbols')
const { InvalidArgumentError, ClientDestroyedError } = require('../lib/core/errors')
const { nodeMajor } = require('../lib/core/util')
const MockClient = require('../lib/mock/mock-client')
const MockPool = require('../lib/mock/mock-pool')
const { kAgent } = require('../lib/mock/mock-symbols')
const Dispatcher = require('../lib/dispatcher')
const { MockNotMatchedError } = require('../lib/mock/mock-errors')

test('MockAgent - constructor', t => {
  t.plan(5)

  t.test('sets up mock agent', t => {
    t.plan(1)
    t.doesNotThrow(() => new MockAgent())
  })

  t.test('should implement the Dispatcher API', t => {
    t.plan(1)

    const mockAgent = new MockAgent()
    t.type(mockAgent, Dispatcher)
  })

  t.test('sets up mock agent with single connection', t => {
    t.plan(1)
    t.doesNotThrow(() => new MockAgent({ connections: 1 }))
  })

  t.test('should error passed agent is not valid', t => {
    t.plan(2)
    t.throws(() => new MockAgent({ agent: {} }), new InvalidArgumentError('Argument opts.agent must implement Agent'))
    t.throws(() => new MockAgent({ agent: { dispatch: '' } }), new InvalidArgumentError('Argument opts.agent must implement Agent'))
  })

  t.test('should be able to specify the agent to mock', t => {
    t.plan(1)
    const agent = new Agent()
    t.teardown(agent.close.bind(agent))
    const mockAgent = new MockAgent({ agent })

    t.equal(mockAgent[kAgent], agent)
  })
})

test('MockAgent - get', t => {
  t.plan(3)

  t.test('should return MockClient', (t) => {
    t.plan(1)

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent({ connections: 1 })
    t.teardown(mockAgent.close.bind(mockAgent))

    const mockClient = mockAgent.get(baseUrl)
    t.type(mockClient, MockClient)
  })

  t.test('should return MockPool', (t) => {
    t.plan(1)

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent()
    t.teardown(mockAgent.close.bind(mockAgent))

    const mockPool = mockAgent.get(baseUrl)
    t.type(mockPool, MockPool)
  })

  t.test('should return the same instance if already created', (t) => {
    t.plan(1)

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent()
    t.teardown(mockAgent.close.bind(mockAgent))

    const mockPool1 = mockAgent.get(baseUrl)
    const mockPool2 = mockAgent.get(baseUrl)
    t.equal(mockPool1, mockPool2)
  })
})

test('MockAgent - dispatch', t => {
  t.plan(3)

  t.test('should call the dispatch method of the MockPool', (t) => {
    t.plan(1)

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent()
    t.teardown(mockAgent.close.bind(mockAgent))

    const mockPool = mockAgent.get(baseUrl)

    mockPool.intercept({
      path: '/foo',
      method: 'GET'
    }).reply(200, 'hello')

    t.doesNotThrow(() => mockAgent.dispatch({
      origin: baseUrl,
      path: '/foo',
      method: 'GET'
    }, {
      onHeaders: (_statusCode, _headers, resume) => resume(),
      onData: () => {},
      onComplete: () => {},
      onError: () => {}
    }))
  })

  t.test('should call the dispatch method of the MockClient', (t) => {
    t.plan(1)

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent({ connections: 1 })
    t.teardown(mockAgent.close.bind(mockAgent))

    const mockClient = mockAgent.get(baseUrl)

    mockClient.intercept({
      path: '/foo',
      method: 'GET'
    }).reply(200, 'hello')

    t.doesNotThrow(() => mockAgent.dispatch({
      origin: baseUrl,
      path: '/foo',
      method: 'GET'
    }, {
      onHeaders: (_statusCode, _headers, resume) => resume(),
      onData: () => {},
      onComplete: () => {},
      onError: () => {}
    }))
  })

  t.test('should throw if handler is not valid on redirect', (t) => {
    t.plan(7)

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent()
    t.teardown(mockAgent.close.bind(mockAgent))

    t.throws(() => mockAgent.dispatch({
      origin: baseUrl,
      path: '/foo',
      method: 'GET'
    }, {
      onError: 'INVALID'
    }), new InvalidArgumentError('invalid onError method'))

    t.throws(() => mockAgent.dispatch({
      origin: baseUrl,
      path: '/foo',
      method: 'GET'
    }, {
      onError: (err) => { throw err },
      onConnect: 'INVALID'
    }), new InvalidArgumentError('invalid onConnect method'))

    t.throws(() => mockAgent.dispatch({
      origin: baseUrl,
      path: '/foo',
      method: 'GET'
    }, {
      onError: (err) => { throw err },
      onConnect: () => {},
      onBodySent: 'INVALID'
    }), new InvalidArgumentError('invalid onBodySent method'))

    t.throws(() => mockAgent.dispatch({
      origin: baseUrl,
      path: '/foo',
      method: 'CONNECT'
    }, {
      onError: (err) => { throw err },
      onConnect: () => {},
      onBodySent: () => {},
      onUpgrade: 'INVALID'
    }), new InvalidArgumentError('invalid onUpgrade method'))

    t.throws(() => mockAgent.dispatch({
      origin: baseUrl,
      path: '/foo',
      method: 'GET'
    }, {
      onError: (err) => { throw err },
      onConnect: () => {},
      onBodySent: () => {},
      onHeaders: 'INVALID'
    }), new InvalidArgumentError('invalid onHeaders method'))

    t.throws(() => mockAgent.dispatch({
      origin: baseUrl,
      path: '/foo',
      method: 'GET'
    }, {
      onError: (err) => { throw err },
      onConnect: () => {},
      onBodySent: () => {},
      onHeaders: () => {},
      onData: 'INVALID'
    }), new InvalidArgumentError('invalid onData method'))

    t.throws(() => mockAgent.dispatch({
      origin: baseUrl,
      path: '/foo',
      method: 'GET'
    }, {
      onError: (err) => { throw err },
      onConnect: () => {},
      onBodySent: () => {},
      onHeaders: () => {},
      onData: () => {},
      onComplete: 'INVALID'
    }), new InvalidArgumentError('invalid onComplete method'))
  })
})

test('MockAgent - .close should clean up registered pools', async (t) => {
  t.plan(5)

  const baseUrl = 'http://localhost:9999'

  const mockAgent = new MockAgent()

  // Register a pool
  const mockPool = mockAgent.get(baseUrl)
  t.type(mockPool, MockPool)

  t.equal(mockPool[kConnected], 1)
  t.equal(mockAgent[kClients].size, 1)
  await mockAgent.close()
  t.equal(mockPool[kConnected], 0)
  t.equal(mockAgent[kClients].size, 0)
})

test('MockAgent - .close should clean up registered clients', async (t) => {
  t.plan(5)

  const baseUrl = 'http://localhost:9999'

  const mockAgent = new MockAgent({ connections: 1 })

  // Register a pool
  const mockClient = mockAgent.get(baseUrl)
  t.type(mockClient, MockClient)

  t.equal(mockClient[kConnected], 1)
  t.equal(mockAgent[kClients].size, 1)
  await mockAgent.close()
  t.equal(mockClient[kConnected], 0)
  t.equal(mockAgent[kClients].size, 0)
})

test('MockAgent - [kClients] should match encapsulated agent', async (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const agent = new Agent()
  t.teardown(agent.close.bind(agent))

  const mockAgent = new MockAgent({ agent })

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'hello')

  // The MockAgent should encapsulate the input agent clients
  t.equal(mockAgent[kClients].size, agent[kClients].size)
})

test('MockAgent - basic intercept with MockAgent.request', async (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  t.teardown(mockAgent.close.bind(mockAgent))
  const mockPool = mockAgent.get(baseUrl)

  mockPool.intercept({
    path: '/foo?hello=there&see=ya',
    method: 'POST',
    body: 'form1=data1&form2=data2'
  }).reply(200, { foo: 'bar' }, {
    headers: { 'content-type': 'application/json' },
    trailers: { 'Content-MD5': 'test' }
  })

  const { statusCode, headers, trailers, body } = await mockAgent.request({
    origin: baseUrl,
    path: '/foo?hello=there&see=ya',
    method: 'POST',
    body: 'form1=data1&form2=data2'
  })
  t.equal(statusCode, 200)
  t.equal(headers['content-type'], 'application/json')
  t.same(trailers, { 'content-md5': 'test' })

  const jsonResponse = JSON.parse(await getResponse(body))
  t.same(jsonResponse, {
    foo: 'bar'
  })
})

test('MockAgent - basic intercept with request', async (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))
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
  t.equal(statusCode, 200)
  t.equal(headers['content-type'], 'application/json')
  t.same(trailers, { 'content-md5': 'test' })

  const jsonResponse = JSON.parse(await getResponse(body))
  t.same(jsonResponse, {
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
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()

  t.teardown(mockAgent.close.bind(mockAgent))
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
  t.equal(statusCode, 200)
  t.equal(headers['content-type'], 'application/json')
  t.same(trailers, { 'content-md5': 'test' })

  const jsonResponse = JSON.parse(await getResponse(body))
  t.same(jsonResponse, {
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
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const agent = new Agent()
  t.teardown(agent.close.bind(agent))

  const mockAgent = new MockAgent({ agent })
  setGlobalDispatcher(mockAgent)

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
  t.equal(statusCode, 200)
  t.equal(headers['content-type'], 'application/json')
  t.same(trailers, { 'content-md5': 'test' })

  const jsonResponse = JSON.parse(await getResponse(body))
  t.same(jsonResponse, {
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
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent({ connections: 1 })
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

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
  t.equal(statusCode, 200)
  t.equal(headers['content-type'], 'application/json')
  t.same(trailers, { 'content-md5': 'test' })

  const jsonResponse = JSON.parse(await getResponse(body))
  t.same(jsonResponse, {
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
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))
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
  t.equal(statusCode, 200)
  t.equal(headers['content-type'], 'application/json')
  t.same(trailers, { 'content-md5': 'test' })

  const jsonResponse = JSON.parse(await getResponse(body))
  t.same(jsonResponse, {
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
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

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
    t.equal(statusCode, 200)
    t.equal(headers['content-type'], 'application/json')

    const jsonResponse = JSON.parse(await getResponse(body))
    t.same(jsonResponse, {
      foo: 'bar'
    })
  }

  {
    const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
      method: 'POST'
    })
    t.equal(statusCode, 200)
    t.equal(headers['content-type'], 'application/json')

    const jsonResponse = JSON.parse(await getResponse(body))
    t.same(jsonResponse, {
      hello: 'there'
    })
  }
})

test('MockAgent - should call original Pool dispatch if request not found', async (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.equal(req.url, '/foo')
    t.equal(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.equal(statusCode, 200)
  t.equal(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.equal(response, 'hello')
})

test('MockAgent - should call original Client dispatch if request not found', async (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.equal(req.url, '/foo')
    t.equal(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent({ connections: 1 })
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.equal(statusCode, 200)
  t.equal(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.equal(response, 'hello')
})

test('MockAgent - should handle string responses', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'POST'
  }).reply(200, 'hello')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'POST'
  })
  t.equal(statusCode, 200)

  const response = await getResponse(body)
  t.equal(response, 'hello')
})

test('MockAgent - should handle basic concurrency for requests', { jobs: 5 }, async (t) => {
  t.plan(5)

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

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
      innerTest.equal(statusCode, 200)

      const jsonResponse = JSON.parse(await getResponse(body))
      innerTest.same(jsonResponse, {
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
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'POST'
  }).reply(200, 'hello').delay(50)

  const start = process.hrtime()

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'POST'
  })
  t.equal(statusCode, 200)

  const response = await getResponse(body)
  t.equal(response, 'hello')
  const elapsedInMs = process.hrtime(start)[1] / 1e6
  t.ok(elapsedInMs >= 50, `Elapsed time is not greater than 50ms: ${elapsedInMs}`)
})

test('MockAgent - should persist requests', async (t) => {
  t.plan(8)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

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
    t.equal(statusCode, 200)
    t.equal(headers['content-type'], 'application/json')
    t.same(trailers, { 'content-md5': 'test' })

    const jsonResponse = JSON.parse(await getResponse(body))
    t.same(jsonResponse, {
      foo: 'bar'
    })
  }

  {
    const { statusCode, headers, trailers, body } = await request(`${baseUrl}/foo?hello=there&see=ya`, {
      method: 'POST',
      body: 'form1=data1&form2=data2'
    })
    t.equal(statusCode, 200)
    t.equal(headers['content-type'], 'application/json')
    t.same(trailers, { 'content-md5': 'test' })

    const jsonResponse = JSON.parse(await getResponse(body))
    t.same(jsonResponse, {
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
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'POST'
  }).reply(200, 'hello').delay(1).persist()

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'POST'
    })
    t.equal(statusCode, 200)

    const response = await getResponse(body)
    t.equal(response, 'hello')
  }

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'POST'
    })
    t.equal(statusCode, 200)

    const response = await getResponse(body)
    t.equal(response, 'hello')
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
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

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
    t.equal(statusCode, 200)

    const response = await getResponse(body)
    t.equal(response, 'foo')
  }

  {
    const { statusCode, body } = await request(`${baseUrl}/bar`, {
      method: 'POST'
    })
    t.equal(statusCode, 200)

    const response = await getResponse(body)
    t.equal(response, 'bar')
  }
})

test('MockAgent - close removes all registered mock clients', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent({ connections: 1 })
  setGlobalDispatcher(mockAgent)

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  await mockAgent.close()
  t.equal(mockAgent[kClients].size, 0)

  try {
    await request(`${baseUrl}/foo`, { method: 'GET' })
  } catch (err) {
    t.type(err, ClientDestroyedError)
  }
})

test('MockAgent - close removes all registered mock pools', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  await mockAgent.close()
  t.equal(mockAgent[kClients].size, 0)

  try {
    await request(`${baseUrl}/foo`, { method: 'GET' })
  } catch (err) {
    t.type(err, ClientDestroyedError)
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
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

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
    t.equal(req.url, '/foo')
    t.equal(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo').times(2)

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`)
    t.equal(statusCode, 200)

    const response = await getResponse(body)
    t.equal(response, 'foo')
  }

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`)
    t.equal(statusCode, 200)

    const response = await getResponse(body)
    t.equal(response, 'foo')
  }

  {
    const { statusCode, headers, body } = await request(`${baseUrl}/foo`)
    t.equal(statusCode, 200)
    t.equal(headers['content-type'], 'text/plain')

    const response = await getResponse(body)
    t.equal(response, 'hello')
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
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo').times(2).persist()

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.equal(statusCode, 200)

    const response = await getResponse(body)
    t.equal(response, 'foo')
  }

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.equal(statusCode, 200)

    const response = await getResponse(body)
    t.equal(response, 'foo')
  }

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.equal(statusCode, 200)

    const response = await getResponse(body)
    t.equal(response, 'foo')
  }
})

test('MockAgent - matcher should not find mock dispatch if path is of unsupported type', async (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    t.equal(req.url, '/foo')
    t.equal(req.method, 'GET')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: {},
    method: 'GET'
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.equal(statusCode, 200)

  const response = await getResponse(body)
  t.equal(response, 'hello')
})

test('MockAgent - should match path with regex', async (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: /foo/,
    method: 'GET'
  }).reply(200, 'foo').persist()

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.equal(statusCode, 200)

    const response = await getResponse(body)
    t.equal(response, 'foo')
  }

  {
    const { statusCode, body } = await request(`${baseUrl}/hello/foobar`, {
      method: 'GET'
    })
    t.equal(statusCode, 200)

    const response = await getResponse(body)
    t.equal(response, 'foo')
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
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: (value) => value === '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.equal(statusCode, 200)

  const response = await getResponse(body)
  t.equal(response, 'foo')
})

test('MockAgent - should match method with regex', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: /^GET$/
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.equal(statusCode, 200)

  const response = await getResponse(body)
  t.equal(response, 'foo')
})

test('MockAgent - should match method with function', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: (value) => value === 'GET'
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.equal(statusCode, 200)

  const response = await getResponse(body)
  t.equal(response, 'foo')
})

test('MockAgent - should match body with regex', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET',
    body: /hello/
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET',
    body: 'hello=there'
  })
  t.equal(statusCode, 200)

  const response = await getResponse(body)
  t.equal(response, 'foo')
})

test('MockAgent - should match body with function', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

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
  t.equal(statusCode, 200)

  const response = await getResponse(body)
  t.equal(response, 'foo')
})

test('MockAgent - should match headers with string', async (t) => {
  t.plan(6)

  const server = createServer((req, res) => {
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET',
    headers: {
      'User-Agent': 'undici',
      Host: 'example.com'
    }
  }).reply(200, 'foo')

  // Disable net connect so we can make sure it matches properly
  mockAgent.disableNetConnect()

  await t.rejects(request(`${baseUrl}/foo`, {
    method: 'GET'
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  await t.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      foo: 'bar'
    }
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  await t.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      foo: 'bar',
      'User-Agent': 'undici'
    }
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  await t.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      foo: 'bar',
      'User-Agent': 'undici',
      Host: 'wrong'
    }
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      foo: 'bar',
      'User-Agent': 'undici',
      Host: 'example.com'
    }
  })
  t.equal(statusCode, 200)

  const response = await getResponse(body)
  t.equal(response, 'foo')
})

test('MockAgent - should match headers with regex', async (t) => {
  t.plan(6)

  const server = createServer((req, res) => {
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET',
    headers: {
      'User-Agent': /^undici$/,
      Host: /^example.com$/
    }
  }).reply(200, 'foo')

  // Disable net connect so we can make sure it matches properly
  mockAgent.disableNetConnect()

  await t.rejects(request(`${baseUrl}/foo`, {
    method: 'GET'
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  await t.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      foo: 'bar'
    }
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  await t.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      foo: 'bar',
      'User-Agent': 'undici'
    }
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  await t.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      foo: 'bar',
      'User-Agent': 'undici',
      Host: 'wrong'
    }
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      foo: 'bar',
      'User-Agent': 'undici',
      Host: 'example.com'
    }
  })
  t.equal(statusCode, 200)

  const response = await getResponse(body)
  t.equal(response, 'foo')
})

test('MockAgent - should match headers with function', async (t) => {
  t.plan(6)

  const server = createServer((req, res) => {
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET',
    headers: {
      'User-Agent': (value) => value === 'undici',
      Host: (value) => value === 'example.com'
    }
  }).reply(200, 'foo')

  // Disable net connect so we can make sure it matches properly
  mockAgent.disableNetConnect()

  await t.rejects(request(`${baseUrl}/foo`, {
    method: 'GET'
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  await t.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      foo: 'bar'
    }
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  await t.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      foo: 'bar',
      'User-Agent': 'undici'
    }
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  await t.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      foo: 'bar',
      'User-Agent': 'undici',
      Host: 'wrong'
    }
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      foo: 'bar',
      'User-Agent': 'undici',
      Host: 'example.com'
    }
  })
  t.equal(statusCode, 200)

  const response = await getResponse(body)
  t.equal(response, 'foo')
})

test('MockAgent - should match url with regex', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(new RegExp(baseUrl))
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.equal(statusCode, 200)

  const response = await getResponse(body)
  t.equal(response, 'foo')
})

test('MockAgent - should match url with function', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get((value) => baseUrl === value)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.equal(statusCode, 200)

  const response = await getResponse(body)
  t.equal(response, 'foo')
})

test('MockAgent - handle default reply headers', async (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).defaultReplyHeaders({ foo: 'bar' }).reply(200, 'foo', { headers: { hello: 'there' } })

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.equal(statusCode, 200)
  t.same(headers, {
    foo: 'bar',
    hello: 'there'
  })

  const response = await getResponse(body)
  t.equal(response, 'foo')
})

test('MockAgent - handle default reply trailers', async (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).defaultReplyTrailers({ foo: 'bar' }).reply(200, 'foo', { trailers: { hello: 'there' } })

  const { statusCode, trailers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.equal(statusCode, 200)
  t.same(trailers, {
    foo: 'bar',
    hello: 'there'
  })

  const response = await getResponse(body)
  t.equal(response, 'foo')
})

test('MockAgent - return calculated content-length if specified', async (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).replyContentLength().reply(200, 'foo', { headers: { hello: 'there' } })

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.equal(statusCode, 200)
  t.same(headers, {
    hello: 'there',
    'content-length': 3
  })

  const response = await getResponse(body)
  t.equal(response, 'foo')
})

test('MockAgent - return calculated content-length for object response if specified', async (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).replyContentLength().reply(200, { foo: 'bar' }, { headers: { hello: 'there' } })

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.equal(statusCode, 200)
  t.same(headers, {
    hello: 'there',
    'content-length': 13
  })

  const jsonResponse = JSON.parse(await getResponse(body))
  t.same(jsonResponse, { foo: 'bar' })
})

test('MockAgent - should activate and deactivate mock clients', async (t) => {
  t.plan(9)

  const server = createServer((req, res) => {
    t.equal(req.url, '/foo')
    t.equal(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo').persist()

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.equal(statusCode, 200)

    const response = await getResponse(body)
    t.equal(response, 'foo')
  }

  mockAgent.deactivate()

  {
    const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.equal(statusCode, 200)
    t.equal(headers['content-type'], 'text/plain')

    const response = await getResponse(body)
    t.equal(response, 'hello')
  }

  mockAgent.activate()

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.equal(statusCode, 200)

    const response = await getResponse(body)
    t.equal(response, 'foo')
  }
})

test('MockAgent - enableNetConnect should allow all original dispatches to be called if dispatch not found', async (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.equal(req.url, '/foo')
    t.equal(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  mockAgent.enableNetConnect()

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.equal(statusCode, 200)
  t.equal(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.equal(response, 'hello')
})

test('MockAgent - enableNetConnect with a host string should allow all original dispatches to be called if mockDispatch not found', async (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.equal(req.url, '/foo')
    t.equal(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  mockAgent.enableNetConnect(`localhost:${server.address().port}`)

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.equal(statusCode, 200)
  t.equal(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.equal(response, 'hello')
})

test('MockAgent - enableNetConnect when called with host string multiple times should allow all original dispatches to be called if mockDispatch not found', async (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.equal(req.url, '/foo')
    t.equal(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

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
  t.equal(statusCode, 200)
  t.equal(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.equal(response, 'hello')
})

test('MockAgent - enableNetConnect with a host regex should allow all original dispatches to be called if mockDispatch not found', async (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.equal(req.url, '/foo')
    t.equal(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  mockAgent.enableNetConnect(new RegExp(`localhost:${server.address().port}`))

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.equal(statusCode, 200)
  t.equal(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.equal(response, 'hello')
})

test('MockAgent - enableNetConnect with a function should allow all original dispatches to be called if mockDispatch not found', async (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.equal(req.url, '/foo')
    t.equal(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  mockAgent.enableNetConnect((value) => value === `localhost:${server.address().port}`)

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.equal(statusCode, 200)
  t.equal(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.equal(response, 'hello')
})

test('MockAgent - enableNetConnect with an unknown input should throw', async (t) => {
  t.plan(1)

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get('http://localhost:9999')
  mockPool.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  t.throws(() => mockAgent.enableNetConnect({}), new InvalidArgumentError('Unsupported matcher. Must be one of String|Function|RegExp.'))
})

test('MockAgent - enableNetConnect should throw if dispatch not matched for path and the origin was not allowed by net connect', async (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    t.fail('should not be called')
    t.end()
    res.end('should not be called')
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  mockAgent.enableNetConnect('example.com:9999')

  await t.rejects(request(`${baseUrl}/wrong`, {
    method: 'GET'
  }), new MockNotMatchedError(`Mock dispatch not matched for path '/wrong': subsequent request to origin ${baseUrl} was not allowed (net.connect is not enabled for this origin)`))
})

test('MockAgent - enableNetConnect should throw if dispatch not matched for method and the origin was not allowed by net connect', async (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    t.fail('should not be called')
    t.end()
    res.end('should not be called')
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  mockAgent.enableNetConnect('example.com:9999')

  await t.rejects(request(`${baseUrl}/foo`, {
    method: 'WRONG'
  }), new MockNotMatchedError(`Mock dispatch not matched for method 'WRONG': subsequent request to origin ${baseUrl} was not allowed (net.connect is not enabled for this origin)`))
})

test('MockAgent - enableNetConnect should throw if dispatch not matched for body and the origin was not allowed by net connect', async (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    t.fail('should not be called')
    t.end()
    res.end('should not be called')
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET',
    body: 'hello'
  }).reply(200, 'foo')

  mockAgent.enableNetConnect('example.com:9999')

  await t.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    body: 'wrong'
  }), new MockNotMatchedError(`Mock dispatch not matched for body 'wrong': subsequent request to origin ${baseUrl} was not allowed (net.connect is not enabled for this origin)`))
})

test('MockAgent - enableNetConnect should throw if dispatch not matched for headers and the origin was not allowed by net connect', async (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    t.fail('should not be called')
    t.end()
    res.end('should not be called')
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET',
    headers: {
      'User-Agent': 'undici'
    }
  }).reply(200, 'foo')

  mockAgent.enableNetConnect('example.com:9999')

  await t.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      'User-Agent': 'wrong'
    }
  }), new MockNotMatchedError(`Mock dispatch not matched for headers '{"User-Agent":"wrong"}': subsequent request to origin ${baseUrl} was not allowed (net.connect is not enabled for this origin)`))
})

test('MockAgent - disableNetConnect should throw if dispatch not found by net connect', async (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    t.equal(req.url, '/foo')
    t.equal(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  mockAgent.disableNetConnect()

  await t.rejects(request(`${baseUrl}/foo`, {
    method: 'GET'
  }), new MockNotMatchedError(`Mock dispatch not matched for path '/foo': subsequent request to origin ${baseUrl} was not allowed (net.connect disabled)`))
})

test('MockAgent - headers function interceptor', async (t) => {
  t.plan(7)

  const server = createServer((req, res) => {
    t.fail('should not be called')
    t.end()
    res.end('should not be called')
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))
  const mockPool = mockAgent.get(baseUrl)

  // Disable net connect so we can make sure it matches properly
  mockAgent.disableNetConnect()

  mockPool.intercept({
    path: '/foo',
    method: 'GET',
    headers (headers) {
      t.equal(typeof headers, 'object')
      return !Object.keys(headers).includes('authorization')
    }
  }).reply(200, 'foo').times(2)

  await t.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      Authorization: 'Bearer foo'
    }
  }), new MockNotMatchedError(`Mock dispatch not matched for headers '{"Authorization":"Bearer foo"}': subsequent request to origin ${baseUrl} was not allowed (net.connect disabled)`))

  {
    const { statusCode } = await request(`${baseUrl}/foo`, {
      method: 'GET',
      headers: {
        foo: 'bar'
      }
    })
    t.equal(statusCode, 200)
  }

  {
    const { statusCode } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.equal(statusCode, 200)
  }
})

test('MockAgent - clients are not garbage collected', async (t) => {
  const samples = 250
  t.plan(2)

  const server = createServer((req, res) => {
    t.fail('should not be called')
    t.end()
    res.end('should not be called')
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  // Create the dispatcher and isable net connect so we can make sure it matches properly
  const dispatcher = new MockAgent()
  dispatcher.disableNetConnect()

  // When Node 16 is the minimum supported, this can be replaced by simply requiring setTimeout from timers/promises
  function sleep (delay) {
    return new Promise(resolve => {
      setTimeout(resolve, delay)
    })
  }

  // Purposely create the pool inside a function so that the reference is lost
  function intercept () {
    // Create the pool and add a lot of intercepts
    const pool = dispatcher.get(baseUrl)

    for (let i = 0; i < samples; i++) {
      pool.intercept({
        path: `/foo/${i}`,
        method: 'GET'
      }).reply(200, Buffer.alloc(1024 * 1024))
    }
  }

  intercept()

  const results = new Set()
  for (let i = 0; i < samples; i++) {
    // Let's make some time pass to allow garbage collection to happen
    await sleep(10)

    const { statusCode } = await request(`${baseUrl}/foo/${i}`, { method: 'GET', dispatcher })
    results.add(statusCode)
  }

  t.equal(results.size, 1)
  t.ok(results.has(200))
})

// https://github.com/nodejs/undici/issues/1321
test('MockAgent - using fetch yields correct statusText', { skip: nodeMajor < 16 }, async (t) => {
  const { fetch } = require('..')

  const mockAgent = new MockAgent()
  mockAgent.disableNetConnect()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get('http://localhost:3000')

  mockPool.intercept({
    path: '/statusText',
    method: 'GET'
  }).reply(200, 'Body')

  const { status, statusText } = await fetch('http://localhost:3000/statusText')

  t.equal(status, 200)
  t.equal(statusText, 'OK')

  mockPool.intercept({
    path: '/unknownStatusText',
    method: 'GET'
  }).reply(420, 'Everyday')

  const unknownStatusCodeRes = await fetch('http://localhost:3000/unknownStatusText')
  t.equal(unknownStatusCodeRes.status, 420)
  t.equal(unknownStatusCodeRes.statusText, 'unknown')

  t.end()
})

// https://github.com/nodejs/undici/issues/1556
test('MockAgent - using fetch yields a headers object in the reply callback', { skip: nodeMajor < 16 }, async (t) => {
  const { fetch } = require('..')

  const mockAgent = new MockAgent()
  mockAgent.disableNetConnect()
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get('http://localhost:3000')

  mockPool.intercept({
    path: '/headers',
    method: 'GET'
  }).reply(200, (opts) => {
    t.same(opts.headers, {
      accept: '*/*',
      'accept-language': '*',
      'sec-fetch-mode': 'cors',
      'user-agent': 'undici',
      'accept-encoding': 'gzip, deflate'
    })

    return {}
  })

  await fetch('http://localhost:3000/headers', {
    dispatcher: mockAgent
  })

  t.end()
})

// https://github.com/nodejs/undici/issues/1579
test('MockAgent - headers in mock dispatcher intercept should be case-insensitive', { skip: nodeMajor < 16 }, async (t) => {
  const { fetch } = require('..')

  const mockAgent = new MockAgent()
  mockAgent.disableNetConnect()
  setGlobalDispatcher(mockAgent)
  t.teardown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get('https://example.com')

  mockPool
    .intercept({
      path: '/',
      headers: {
        authorization: 'Bearer 12345',
        'USER-agent': 'undici'
      }
    })
    .reply(200)

  await fetch('https://example.com', {
    headers: {
      Authorization: 'Bearer 12345',
      'user-AGENT': 'undici'
    }
  })

  t.end()
})

// https://github.com/nodejs/undici/issues/1757
test('MockAgent - reply callback can be asynchronous', { skip: nodeMajor < 16 }, async (t) => {
  const { fetch } = require('..')
  const ReadableStream = globalThis.ReadableStream || require('stream/web').ReadableStream

  class MiniflareDispatcher extends Dispatcher {
    constructor (inner, options) {
      super(options)
      this.inner = inner
    }

    dispatch (options, handler) {
      return this.inner.dispatch(options, handler)
    }

    close (...args) {
      return this.inner.close(...args)
    }

    destroy (...args) {
      return this.inner.destroy(...args)
    }
  }

  const mockAgent = new MockAgent()
  const mockClient = mockAgent.get('http://localhost:3000')
  mockAgent.disableNetConnect()
  setGlobalDispatcher(new MiniflareDispatcher(mockAgent))

  t.teardown(mockAgent.close.bind(mockAgent))

  mockClient.intercept({
    path: () => true,
    method: () => true
  }).reply(200, async (opts) => {
    if (opts.body && opts.body[Symbol.asyncIterator]) {
      const chunks = []
      for await (const chunk of opts.body) {
        chunks.push(chunk)
      }

      return Buffer.concat(chunks)
    }

    return opts.body
  }).persist()

  {
    const response = await fetch('http://localhost:3000', {
      method: 'POST',
      body: JSON.stringify({ foo: 'bar' })
    })

    t.same(await response.json(), { foo: 'bar' })
  }

  {
    const response = await fetch('http://localhost:3000', {
      method: 'POST',
      body: new ReadableStream({
        start (controller) {
          controller.enqueue(new TextEncoder().encode('{"foo":'))

          setTimeout(() => {
            controller.enqueue(new TextEncoder().encode('"bar"}'))
            controller.close()
          }, 100)
        }
      }),
      duplex: 'half'
    })

    t.same(await response.json(), { foo: 'bar' })
  }
})

test('MockAgent - headers should be array of strings', async (t) => {
  const mockAgent = new MockAgent()
  mockAgent.disableNetConnect()
  setGlobalDispatcher(mockAgent)

  const mockPool = mockAgent.get('http://localhost:3000')

  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo', {
    headers: {
      'set-cookie': [
        'foo=bar',
        'bar=baz',
        'baz=qux'
      ]
    }
  })

  const { headers } = await request('http://localhost:3000/foo', {
    method: 'GET'
  })

  t.equal(headers['set-cookie'].length, 3)
})
