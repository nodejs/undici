'use strict'

const { test, after, describe } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { request, setGlobalDispatcher, MockAgent, Agent } = require('..')
const { getResponse } = require('../lib/mock/mock-utils')
const { kClients, kConnected } = require('../lib/core/symbols')
const { InvalidArgumentError, ClientDestroyedError } = require('../lib/core/errors')
const MockClient = require('../lib/mock/mock-client')
const MockPool = require('../lib/mock/mock-pool')
const { kAgent, kMockAgentIsCallHistoryEnabled } = require('../lib/mock/mock-symbols')
const Dispatcher = require('../lib/dispatcher/dispatcher')
const { MockNotMatchedError } = require('../lib/mock/mock-errors')
const { fetch } = require('..')
const { MockCallHistory } = require('../lib/mock/mock-call-history')

describe('MockAgent - constructor', () => {
  test('sets up mock agent', t => {
    t.plan(1)
    t.assert.doesNotThrow(() => new MockAgent())
  })

  test('should implement the Dispatcher API', t => {
    t.plan(1)

    const mockAgent = new MockAgent()
    t.assert.ok(mockAgent instanceof Dispatcher)
  })

  test('sets up mock agent with single connection', t => {
    t.plan(1)
    t.assert.doesNotThrow(() => new MockAgent({ connections: 1 }))
  })

  test('should error passed agent is not valid', t => {
    t.plan(2)
    t.assert.throws(() => new MockAgent({ agent: {} }), new InvalidArgumentError('Argument opts.agent must implement Agent'))
    t.assert.throws(() => new MockAgent({ agent: { dispatch: '' } }), new InvalidArgumentError('Argument opts.agent must implement Agent'))
  })

  test('should be able to specify the agent to mock', t => {
    t.plan(1)
    const agent = new Agent()
    after(() => agent.close())
    const mockAgent = new MockAgent({ agent })

    t.assert.strictEqual(mockAgent[kAgent], agent)
  })

  test('should disable call history by default', t => {
    t.plan(2)
    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    t.assert.strictEqual(mockAgent[kMockAgentIsCallHistoryEnabled], false)
    t.assert.strictEqual(mockAgent.getCallHistory(), undefined)
  })

  test('should enable call history if option is true', t => {
    t.plan(2)
    const mockAgent = new MockAgent({ enableCallHistory: true })
    after(() => mockAgent.close())

    t.assert.strictEqual(mockAgent[kMockAgentIsCallHistoryEnabled], true)
    t.assert.ok(mockAgent.getCallHistory() instanceof MockCallHistory)
  })

  test('should disable call history if option is false', t => {
    t.plan(2)
    after(() => mockAgent.close())
    const mockAgent = new MockAgent({ enableCallHistory: false })

    t.assert.strictEqual(mockAgent[kMockAgentIsCallHistoryEnabled], false)
    t.assert.strictEqual(mockAgent.getCallHistory(), undefined)
  })

  test('should throw if enableCallHistory option is not a boolean', t => {
    t.plan(1)

    t.assert.throws(() => new MockAgent({ enableCallHistory: 'hello' }), new InvalidArgumentError('options.enableCallHistory must to be a boolean'))
  })
})

describe('MockAgent - enableCallHistory', () => {
  test('should enable call history and add call history log', async (t) => {
    t.plan(2)

    const mockAgent = new MockAgent()
    setGlobalDispatcher(mockAgent)
    after(() => mockAgent.close())

    const mockClient = mockAgent.get('http://localhost:9999')
    mockClient.intercept({
      path: '/foo',
      method: 'GET'
    }).reply(200, 'foo').persist()

    await fetch('http://localhost:9999/foo')

    t.assert.strictEqual(mockAgent.getCallHistory()?.calls()?.length, undefined)

    mockAgent.enableCallHistory()

    await request('http://localhost:9999/foo')

    t.assert.strictEqual(mockAgent.getCallHistory()?.calls()?.length, 1)
  })
})

describe('MockAgent - disableCallHistory', () => {
  test('should disable call history and not add call history log', async (t) => {
    t.plan(2)

    const mockAgent = new MockAgent({ enableCallHistory: true })
    setGlobalDispatcher(mockAgent)
    after(() => mockAgent.close())

    const mockClient = mockAgent.get('http://localhost:9999')
    mockClient.intercept({
      path: '/foo',
      method: 'GET'
    }).reply(200, 'foo').persist()

    await request('http://localhost:9999/foo')

    t.assert.strictEqual(mockAgent.getCallHistory()?.calls()?.length, 1)

    mockAgent.disableCallHistory()

    await request('http://localhost:9999/foo')

    t.assert.strictEqual(mockAgent.getCallHistory()?.calls()?.length, 1)
  })
})

describe('MockAgent - get', () => {
  test('should return MockClient', (t) => {
    t.plan(1)

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent({ connections: 1 })
    after(() => mockAgent.close())

    const mockClient = mockAgent.get(baseUrl)
    t.assert.ok(mockClient instanceof MockClient)
  })

  test('should return MockPool', (t) => {
    t.plan(1)

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const mockPool = mockAgent.get(baseUrl)
    t.assert.ok(mockPool instanceof MockPool)
  })

  test('should return the same instance if already created', (t) => {
    t.plan(1)

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const mockPool1 = mockAgent.get(baseUrl)
    const mockPool2 = mockAgent.get(baseUrl)
    t.assert.strictEqual(mockPool1, mockPool2)
  })
})

describe('MockAgent - dispatch', () => {
  test('should call the dispatch method of the MockPool', (t) => {
    t.plan(1)

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const mockPool = mockAgent.get(baseUrl)

    mockPool.intercept({
      path: '/foo',
      method: 'GET'
    }).reply(200, 'hello')

    t.assert.doesNotThrow(() => mockAgent.dispatch({
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

  test('should call the dispatch method of the MockClient', (t) => {
    t.plan(1)

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent({ connections: 1 })
    after(() => mockAgent.close())

    const mockClient = mockAgent.get(baseUrl)

    mockClient.intercept({
      path: '/foo',
      method: 'GET'
    }).reply(200, 'hello')

    t.assert.doesNotThrow(() => mockAgent.dispatch({
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
})

test('MockAgent - .close should clean up registered pools', async (t) => {
  t.plan(5)

  const baseUrl = 'http://localhost:9999'

  const mockAgent = new MockAgent()

  // Register a pool
  const mockPool = mockAgent.get(baseUrl)
  t.assert.ok(mockPool instanceof MockPool)

  t.assert.strictEqual(mockPool[kConnected], 1)
  t.assert.strictEqual(mockAgent[kClients].size, 1)
  await mockAgent.close()
  t.assert.strictEqual(mockPool[kConnected], 0)
  t.assert.strictEqual(mockAgent[kClients].size, 0)
})

test('MockAgent - .close should clean up registered clients', async (t) => {
  t.plan(5)

  const baseUrl = 'http://localhost:9999'

  const mockAgent = new MockAgent({ connections: 1 })

  // Register a pool
  const mockClient = mockAgent.get(baseUrl)
  t.assert.ok(mockClient instanceof MockClient)

  t.assert.strictEqual(mockClient[kConnected], 1)
  t.assert.strictEqual(mockAgent[kClients].size, 1)
  await mockAgent.close()
  t.assert.strictEqual(mockClient[kConnected], 0)
  t.assert.strictEqual(mockAgent[kClients].size, 0)
})

test('MockAgent - [kClients] should match encapsulated agent', async (t) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const agent = new Agent()
  after(() => agent.close())

  const mockAgent = new MockAgent({ agent })

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'hello')

  // The MockAgent should encapsulate the input agent clients
  t.assert.strictEqual(mockAgent[kClients].size, agent[kClients].size)
})

test('MockAgent - basic intercept with MockAgent.request', async (t) => {
  t.plan(4)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  after(() => mockAgent.close())
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
  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(headers['content-type'], 'application/json')
  t.assert.deepStrictEqual(trailers, { 'content-md5': 'test' })

  const jsonResponse = JSON.parse(await getResponse(body))
  t.assert.deepStrictEqual(jsonResponse, {
    foo: 'bar'
  })
})

test('MockAgent - basic intercept with request', async (t) => {
  t.plan(4)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())
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
  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(headers['content-type'], 'application/json')
  t.assert.deepStrictEqual(trailers, { 'content-md5': 'test' })

  const jsonResponse = JSON.parse(await getResponse(body))
  t.assert.deepStrictEqual(jsonResponse, {
    foo: 'bar'
  })
})

test('MockAgent - should support local agents', async (t) => {
  t.plan(4)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()

  after(() => mockAgent.close())
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
  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(headers['content-type'], 'application/json')
  t.assert.deepStrictEqual(trailers, { 'content-md5': 'test' })

  const jsonResponse = JSON.parse(await getResponse(body))
  t.assert.deepStrictEqual(jsonResponse, {
    foo: 'bar'
  })
})

test('MockAgent - should support specifying custom agents to mock', async (t) => {
  t.plan(4)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const agent = new Agent()
  after(() => agent.close())

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
  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(headers['content-type'], 'application/json')
  t.assert.deepStrictEqual(trailers, { 'content-md5': 'test' })

  const jsonResponse = JSON.parse(await getResponse(body))
  t.assert.deepStrictEqual(jsonResponse, {
    foo: 'bar'
  })
})

test('MockAgent - basic Client intercept with request', async (t) => {
  t.plan(4)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent({ connections: 1 })
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

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
  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(headers['content-type'], 'application/json')
  t.assert.deepStrictEqual(trailers, { 'content-md5': 'test' })

  const jsonResponse = JSON.parse(await getResponse(body))
  t.assert.deepStrictEqual(jsonResponse, {
    foo: 'bar'
  })
})

test('MockAgent - basic intercept with multiple pools', async (t) => {
  t.plan(4)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())
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
  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(headers['content-type'], 'application/json')
  t.assert.deepStrictEqual(trailers, { 'content-md5': 'test' })

  const jsonResponse = JSON.parse(await getResponse(body))
  t.assert.deepStrictEqual(jsonResponse, {
    foo: 'bar-1'
  })
})

test('MockAgent - should handle multiple responses for an interceptor', async (t) => {
  t.plan(6)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

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
    t.assert.strictEqual(statusCode, 200)
    t.assert.strictEqual(headers['content-type'], 'application/json')

    const jsonResponse = JSON.parse(await getResponse(body))
    t.assert.deepStrictEqual(jsonResponse, {
      foo: 'bar'
    })
  }

  {
    const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
      method: 'POST'
    })
    t.assert.strictEqual(statusCode, 200)
    t.assert.strictEqual(headers['content-type'], 'application/json')

    const jsonResponse = JSON.parse(await getResponse(body))
    t.assert.deepStrictEqual(jsonResponse, {
      hello: 'there'
    })
  }
})

test('MockAgent - should call original Pool dispatch if request not found', async (t) => {
  t.plan(5)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.url, '/foo')
    t.assert.strictEqual(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'hello')
})

test('MockAgent - should call original Client dispatch if request not found', async (t) => {
  t.plan(5)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.url, '/foo')
    t.assert.strictEqual(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent({ connections: 1 })
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'hello')
})

test('MockAgent - should handle string responses', async (t) => {
  t.plan(2)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'POST'
  }).reply(200, 'hello')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'POST'
  })
  t.assert.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'hello')
})

test('MockAgent - should handle basic concurrency for requests', { jobs: 5 }, async (t) => {
  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  await Promise.all([...Array(5).keys()].map(idx =>
    test(`concurrent job (${idx})`, async (t) => {
      t.plan(2)

      const baseUrl = 'http://localhost:9999'

      const mockPool = mockAgent.get(baseUrl)
      mockPool.intercept({
        path: '/foo',
        method: 'POST'
      }).reply(200, { foo: `bar ${idx}` })

      const { statusCode, body } = await request(`${baseUrl}/foo`, {
        method: 'POST'
      })
      t.assert.strictEqual(statusCode, 200)

      const jsonResponse = JSON.parse(await getResponse(body))
      t.assert.deepStrictEqual(jsonResponse, {
        foo: `bar ${idx}`
      })
    })
  ))
})

test('MockAgent - handle delays to simulate work', async (t) => {
  t.plan(3)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'POST'
  }).reply(200, 'hello').delay(50)

  const start = process.hrtime()

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'POST'
  })
  t.assert.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'hello')
  const elapsedInMs = Math.ceil(process.hrtime(start)[1] / 1e6)
  t.assert.ok(elapsedInMs >= 50, `Elapsed time is not greater than 50ms: ${elapsedInMs}`)
})

test('MockAgent - should persist requests', async (t) => {
  t.plan(8)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

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
    t.assert.strictEqual(statusCode, 200)
    t.assert.strictEqual(headers['content-type'], 'application/json')
    t.assert.deepStrictEqual(trailers, { 'content-md5': 'test' })

    const jsonResponse = JSON.parse(await getResponse(body))
    t.assert.deepStrictEqual(jsonResponse, {
      foo: 'bar'
    })
  }

  {
    const { statusCode, headers, trailers, body } = await request(`${baseUrl}/foo?hello=there&see=ya`, {
      method: 'POST',
      body: 'form1=data1&form2=data2'
    })
    t.assert.strictEqual(statusCode, 200)
    t.assert.strictEqual(headers['content-type'], 'application/json')
    t.assert.deepStrictEqual(trailers, { 'content-md5': 'test' })

    const jsonResponse = JSON.parse(await getResponse(body))
    t.assert.deepStrictEqual(jsonResponse, {
      foo: 'bar'
    })
  }
})

test('MockAgent - getCallHistory with no name parameter should return the agent call history', async (t) => {
  t.plan(1)

  const mockAgent = new MockAgent({ enableCallHistory: true })
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockClient = mockAgent.get('http://localhost:9999')
  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  t.assert.ok(mockAgent.getCallHistory() instanceof MockCallHistory)
})

test('MockAgent - getCallHistory with request should return the call history instance with history log', async (t) => {
  t.plan(9)

  const mockAgent = new MockAgent({ enableCallHistory: true })
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const baseUrl = 'http://localhost:9999'
  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: /^\/foo/,
    method: 'POST'
  }).reply(200, 'foo')

  t.assert.ok(mockAgent.getCallHistory()?.calls().length === 0)

  const path = '/foo'
  const url = new URL(path, baseUrl)
  const method = 'POST'
  const body = { data: 'value' }
  const query = { a: 1 }
  const headers = { 'content-type': 'application/json' }

  await request(url, { method, query, body: JSON.stringify(body), headers })

  t.assert.ok(mockAgent.getCallHistory()?.calls().length === 1)
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.body, JSON.stringify(body))
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.headers, headers)
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.method, method)
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.origin, baseUrl)
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.path, path)
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.fullUrl, `${url.toString()}?${new URLSearchParams(query).toString()}`)
  t.assert.deepStrictEqual(mockAgent.getCallHistory()?.lastCall()?.searchParams, { a: '1' })
})

test('MockAgent - getCallHistory with fetch should return the call history instance with history log', async (t) => {
  t.plan(9)

  const mockAgent = new MockAgent({ enableCallHistory: true })
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const baseUrl = 'http://localhost:9999'
  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: /^\/foo/,
    method: 'POST'
  }).reply(200, 'foo')

  t.assert.ok(mockAgent.getCallHistory()?.calls().length === 0)

  const path = '/foo'
  const url = new URL(path, baseUrl)
  const method = 'POST'
  const body = { data: 'value' }
  const query = { a: 1 }
  url.search = new URLSearchParams(query)
  const headers = { authorization: 'token', 'content-type': 'application/json' }

  await fetch(url, { method, query, body: JSON.stringify(body), headers })

  t.assert.ok(mockAgent.getCallHistory()?.calls().length === 1)
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.body, JSON.stringify(body))
  t.assert.deepStrictEqual(mockAgent.getCallHistory()?.lastCall()?.headers, {
    ...headers,
    'accept-encoding': 'gzip, deflate',
    'content-length': '16',
    'content-type': 'application/json',
    'accept-language': '*',
    'sec-fetch-mode': 'cors',
    'user-agent': 'undici',
    accept: '*/*'
  })
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.method, method)
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.origin, baseUrl)
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.path, url.pathname)
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.fullUrl, url.toString())
  t.assert.deepStrictEqual(mockAgent.getCallHistory()?.lastCall()?.searchParams, { a: '1' })
})

test('MockAgent - getCallHistory with fetch with a minimal configuration should register call history log', async (t) => {
  t.plan(11)

  const mockAgent = new MockAgent({ enableCallHistory: true })
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const baseUrl = 'http://localhost:9999'
  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/'
  }).reply(200, 'foo')

  const path = '/'
  const url = new URL(path, baseUrl)

  await fetch(url)

  t.assert.ok(mockAgent.getCallHistory()?.calls().length === 1)
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.body, null)
  t.assert.deepStrictEqual(mockAgent.getCallHistory()?.lastCall()?.headers, {
    'accept-encoding': 'gzip, deflate',
    'accept-language': '*',
    'sec-fetch-mode': 'cors',
    'user-agent': 'undici',
    accept: '*/*'
  })
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.method, 'GET')
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.origin, baseUrl)
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.path, path)
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.fullUrl, baseUrl + path)
  t.assert.deepStrictEqual(mockAgent.getCallHistory()?.lastCall()?.searchParams, {})
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.host, 'localhost:9999')
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.port, '9999')
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.protocol, 'http:')
})

test('MockAgent - getCallHistory with request with a minimal configuration should register call history log', async (t) => {
  t.plan(11)

  const mockAgent = new MockAgent({ enableCallHistory: true })
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const baseUrl = 'http://localhost:9999'
  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/'
  }).reply(200, 'foo')

  const path = '/'
  const url = new URL(path, baseUrl)

  await request(url)

  t.assert.ok(mockAgent.getCallHistory()?.calls().length === 1)
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.body, undefined)
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.headers, undefined)
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.method, 'GET')
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.origin, baseUrl)
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.path, path)
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.fullUrl, baseUrl + path)
  t.assert.deepStrictEqual(mockAgent.getCallHistory()?.lastCall()?.searchParams, {})
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.host, 'localhost:9999')
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.port, '9999')
  t.assert.strictEqual(mockAgent.getCallHistory()?.lastCall()?.protocol, 'http:')
})

test('MockAgent - clearCallHistory should clear call history logs', async (t) => {
  t.plan(3)

  const mockAgent = new MockAgent({ enableCallHistory: true })
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const baseUrl = 'http://localhost:9999'
  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: /^\/foo/,
    method: 'POST'
  }).reply(200, 'foo').persist()

  t.assert.ok(mockAgent.getCallHistory()?.calls().length === 0)

  const path = '/foo'
  const url = new URL(path, baseUrl)
  const method = 'POST'
  const body = { data: 'value' }
  const query = { a: 1 }
  const headers = { 'content-type': 'application/json' }

  await request(url, { method, query, body: JSON.stringify(body), headers })
  await request(url, { method, query, body: JSON.stringify(body), headers })
  await request(url, { method, query, body: JSON.stringify(body), headers })
  await request(url, { method, query, body: JSON.stringify(body), headers })

  t.assert.ok(mockAgent.getCallHistory()?.calls().length === 4)

  mockAgent.clearCallHistory()

  t.assert.ok(mockAgent.getCallHistory()?.calls().length === 0)
})

test('MockAgent - handle persists with delayed requests', async (t) => {
  t.plan(4)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'POST'
  }).reply(200, 'hello').delay(1).persist()

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'POST'
    })
    t.assert.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.assert.strictEqual(response, 'hello')
  }

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'POST'
    })
    t.assert.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.assert.strictEqual(response, 'hello')
  }
})

test('MockAgent - calling close on a mock pool should not affect other mock pools', async (t) => {
  t.plan(4)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

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
    t.assert.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.assert.strictEqual(response, 'foo')
  }

  {
    const { statusCode, body } = await request(`${baseUrl}/bar`, {
      method: 'POST'
    })
    t.assert.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.assert.strictEqual(response, 'bar')
  }
})

test('MockAgent - close removes all registered mock clients', async (t) => {
  t.plan(2)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent({ connections: 1 })
  setGlobalDispatcher(mockAgent)

  const mockClient = mockAgent.get(baseUrl)
  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  await mockAgent.close()
  t.assert.strictEqual(mockAgent[kClients].size, 0)

  try {
    await request(`${baseUrl}/foo`, { method: 'GET' })
  } catch (err) {
    t.assert.ok(err instanceof ClientDestroyedError)
  }
})

test('MockAgent - close clear all registered mock call history logs', async (t) => {
  t.plan(2)

  const mockAgent = new MockAgent({ enableCallHistory: true })
  setGlobalDispatcher(mockAgent)

  const mockClient = mockAgent.get('http://localhost:9999')

  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  await request('http://localhost:9999/foo')

  t.assert.strictEqual(mockAgent.getCallHistory().calls().length, 1)

  await mockAgent.close()

  t.assert.strictEqual(mockAgent.getCallHistory().calls().length, 0)
})

test('MockAgent - close removes all registered mock pools', async (t) => {
  t.plan(2)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  await mockAgent.close()
  t.assert.strictEqual(mockAgent[kClients].size, 0)

  try {
    await request(`${baseUrl}/foo`, { method: 'GET' })
  } catch (err) {
    t.assert.ok(err instanceof ClientDestroyedError)
  }
})

test('MockAgent - should handle replyWithError', async (t) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).replyWithError(new Error('kaboom'))

  await t.assert.rejects(request(`${baseUrl}/foo`, { method: 'GET' }), new Error('kaboom'))
})

test('MockAgent - should support setting a reply to respond a set amount of times', async (t) => {
  t.plan(9)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.url, '/foo')
    t.assert.strictEqual(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo').times(2)

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`)
    t.assert.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.assert.strictEqual(response, 'foo')
  }

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`)
    t.assert.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.assert.strictEqual(response, 'foo')
  }

  {
    const { statusCode, headers, body } = await request(`${baseUrl}/foo`)
    t.assert.strictEqual(statusCode, 200)
    t.assert.strictEqual(headers['content-type'], 'text/plain')

    const response = await getResponse(body)
    t.assert.strictEqual(response, 'hello')
  }
})

test('MockAgent - persist overrides times', async (t) => {
  t.plan(6)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo').times(2).persist()

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.assert.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.assert.strictEqual(response, 'foo')
  }

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.assert.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.assert.strictEqual(response, 'foo')
  }

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.assert.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.assert.strictEqual(response, 'foo')
  }
})

test('MockAgent - matcher should not find mock dispatch if path is of unsupported type', async (t) => {
  t.plan(4)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.url, '/foo')
    t.assert.strictEqual(req.method, 'GET')
    res.end('hello')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: {},
    method: 'GET'
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.assert.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'hello')
})

test('MockAgent - should match path with regex', async (t) => {
  t.plan(4)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: /foo/,
    method: 'GET'
  }).reply(200, 'foo').persist()

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.assert.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.assert.strictEqual(response, 'foo')
  }

  {
    const { statusCode, body } = await request(`${baseUrl}/hello/foobar`, {
      method: 'GET'
    })
    t.assert.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.assert.strictEqual(response, 'foo')
  }
})

test('MockAgent - should match path with function', async (t) => {
  t.plan(2)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: (value) => value === '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.assert.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'foo')
})

test('MockAgent - should match method with regex', async (t) => {
  t.plan(2)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: /^GET$/
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.assert.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'foo')
})

test('MockAgent - should match method with function', async (t) => {
  t.plan(2)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: (value) => value === 'GET'
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.assert.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'foo')
})

test('MockAgent - should match body with regex', async (t) => {
  t.plan(2)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

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
  t.assert.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'foo')
})

test('MockAgent - should match body with function', async (t) => {
  t.plan(2)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

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
  t.assert.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'foo')
})

test('MockAgent - should match headers with string', async (t) => {
  t.plan(6)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

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

  await t.assert.rejects(request(`${baseUrl}/foo`, {
    method: 'GET'
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  await t.assert.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      foo: 'bar'
    }
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  await t.assert.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      foo: 'bar',
      'User-Agent': 'undici'
    }
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  await t.assert.rejects(request(`${baseUrl}/foo`, {
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
  t.assert.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'foo')
})

test('MockAgent - should match headers with regex', async (t) => {
  t.plan(6)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

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

  await t.assert.rejects(request(`${baseUrl}/foo`, {
    method: 'GET'
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  await t.assert.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      foo: 'bar'
    }
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  await t.assert.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      foo: 'bar',
      'User-Agent': 'undici'
    }
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  await t.assert.rejects(request(`${baseUrl}/foo`, {
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
  t.assert.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'foo')
})

test('MockAgent - should match headers with function', async (t) => {
  t.plan(6)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

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

  await t.assert.rejects(request(`${baseUrl}/foo`, {
    method: 'GET'
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  await t.assert.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      foo: 'bar'
    }
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  await t.assert.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      foo: 'bar',
      'User-Agent': 'undici'
    }
  }), MockNotMatchedError, 'should reject with MockNotMatchedError')

  await t.assert.rejects(request(`${baseUrl}/foo`, {
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
  t.assert.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'foo')
})

test('MockAgent - should match url with regex', async (t) => {
  t.plan(2)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(new RegExp(baseUrl))
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.assert.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'foo')
})

test('MockAgent - should match url with function', async (t) => {
  t.plan(2)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get((value) => baseUrl === value)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.assert.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'foo')
})

test('MockAgent - handle default reply headers', async (t) => {
  t.plan(3)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).defaultReplyHeaders({ foo: 'bar' }).reply(200, 'foo', { headers: { hello: 'there' } })

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.assert.strictEqual(statusCode, 200)
  t.assert.deepStrictEqual(headers, {
    foo: 'bar',
    hello: 'there'
  })

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'foo')
})

test('MockAgent - handle default reply trailers', async (t) => {
  t.plan(3)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).defaultReplyTrailers({ foo: 'bar' }).reply(200, 'foo', { trailers: { hello: 'there' } })

  const { statusCode, trailers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.assert.strictEqual(statusCode, 200)
  t.assert.deepStrictEqual(trailers, {
    foo: 'bar',
    hello: 'there'
  })

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'foo')
})

test('MockAgent - return calculated content-length if specified', async (t) => {
  t.plan(3)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).replyContentLength().reply(200, 'foo', { headers: { hello: 'there' } })

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.assert.strictEqual(statusCode, 200)
  t.assert.deepStrictEqual(headers, {
    hello: 'there',
    'content-length': '3'
  })

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'foo')
})

test('MockAgent - return calculated content-length for object response if specified', async (t) => {
  t.plan(3)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).replyContentLength().reply(200, { foo: 'bar' }, { headers: { hello: 'there' } })

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.assert.strictEqual(statusCode, 200)
  t.assert.deepStrictEqual(headers, {
    hello: 'there',
    'content-length': '13'
  })

  const jsonResponse = JSON.parse(await getResponse(body))
  t.assert.deepStrictEqual(jsonResponse, { foo: 'bar' })
})

test('MockAgent - should activate and deactivate mock clients', async (t) => {
  t.plan(9)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.url, '/foo')
    t.assert.strictEqual(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo').persist()

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.assert.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.assert.strictEqual(response, 'foo')
  }

  mockAgent.deactivate()

  {
    const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.assert.strictEqual(statusCode, 200)
    t.assert.strictEqual(headers['content-type'], 'text/plain')

    const response = await getResponse(body)
    t.assert.strictEqual(response, 'hello')
  }

  mockAgent.activate()

  {
    const { statusCode, body } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.assert.strictEqual(statusCode, 200)

    const response = await getResponse(body)
    t.assert.strictEqual(response, 'foo')
  }
})

test('MockAgent - enableNetConnect should allow all original dispatches to be called if dispatch not found', async (t) => {
  t.plan(5)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.url, '/foo')
    t.assert.strictEqual(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  mockAgent.enableNetConnect()

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'hello')
})

test('MockAgent - enableNetConnect with a host string should allow all original dispatches to be called if mockDispatch not found', async (t) => {
  t.plan(5)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.url, '/foo')
    t.assert.strictEqual(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  mockAgent.enableNetConnect(`localhost:${server.address().port}`)

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'hello')
})

test('MockAgent - enableNetConnect when called with host string multiple times should allow all original dispatches to be called if mockDispatch not found', async (t) => {
  t.plan(5)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.url, '/foo')
    t.assert.strictEqual(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

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
  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'hello')
})

test('MockAgent - enableNetConnect with a host regex should allow all original dispatches to be called if mockDispatch not found', async (t) => {
  t.plan(5)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.url, '/foo')
    t.assert.strictEqual(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  mockAgent.enableNetConnect(new RegExp(`localhost:${server.address().port}`))

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'hello')
})

test('MockAgent - enableNetConnect with a function should allow all original dispatches to be called if mockDispatch not found', async (t) => {
  t.plan(5)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.url, '/foo')
    t.assert.strictEqual(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  mockAgent.enableNetConnect((value) => value === `localhost:${server.address().port}`)

  const { statusCode, headers, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(headers['content-type'], 'text/plain')

  const response = await getResponse(body)
  t.assert.strictEqual(response, 'hello')
})

test('MockAgent - enableNetConnect with an unknown input should throw', async (t) => {
  t.plan(1)

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get('http://localhost:9999')
  mockPool.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  t.assert.throws(() => mockAgent.enableNetConnect({}), new InvalidArgumentError('Unsupported matcher. Must be one of String|Function|RegExp.'))
})

test('MockAgent - enableNetConnect should throw if dispatch not matched for path and the origin was not allowed by net connect', async (t) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.fail('should not be called')
    res.end('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  mockAgent.enableNetConnect('example.com:9999')

  await t.assert.rejects(request(`${baseUrl}/wrong`, {
    method: 'GET'
  }), new MockNotMatchedError(`Mock dispatch not matched for path '/wrong': subsequent request to origin ${baseUrl} was not allowed (net.connect is not enabled for this origin)`))
})

test('MockAgent - enableNetConnect should throw if dispatch not matched for method and the origin was not allowed by net connect', async (t) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.fail('should not be called')
    res.end('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'foo')

  mockAgent.enableNetConnect('example.com:9999')

  await t.assert.rejects(request(`${baseUrl}/foo`, {
    method: 'WRONG'
  }), new MockNotMatchedError(`Mock dispatch not matched for method 'WRONG' on path '/foo': subsequent request to origin ${baseUrl} was not allowed (net.connect is not enabled for this origin)`))
})

test('MockAgent - enableNetConnect should throw if dispatch not matched for body and the origin was not allowed by net connect', async (t) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.fail('should not be called')
    res.end('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET',
    body: 'hello'
  }).reply(200, 'foo')

  mockAgent.enableNetConnect('example.com:9999')

  await t.assert.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    body: 'wrong'
  }), new MockNotMatchedError(`Mock dispatch not matched for body 'wrong' on path '/foo': subsequent request to origin ${baseUrl} was not allowed (net.connect is not enabled for this origin)`))
})

test('MockAgent - enableNetConnect should throw if dispatch not matched for headers and the origin was not allowed by net connect', async (t) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.fail('should not be called')
    res.end('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/foo',
    method: 'GET',
    headers: {
      'User-Agent': 'undici'
    }
  }).reply(200, 'foo')

  mockAgent.enableNetConnect('example.com:9999')

  await t.assert.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      'User-Agent': 'wrong'
    }
  }), new MockNotMatchedError(`Mock dispatch not matched for headers '{"User-Agent":"wrong"}' on path '/foo': subsequent request to origin ${baseUrl} was not allowed (net.connect is not enabled for this origin)`))
})

test('MockAgent - disableNetConnect should throw if dispatch not found by net connect', async (t) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.url, '/foo')
    t.assert.strictEqual(req.method, 'GET')
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  mockPool.intercept({
    path: '/wrong',
    method: 'GET'
  }).reply(200, 'foo')

  mockAgent.disableNetConnect()

  await t.assert.rejects(request(`${baseUrl}/foo`, {
    method: 'GET'
  }), new MockNotMatchedError(`Mock dispatch not matched for path '/foo': subsequent request to origin ${baseUrl} was not allowed (net.connect disabled)`))
})

test('MockAgent - headers function interceptor', async (t) => {
  t.plan(8)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.fail('should not be called')
    res.end('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())
  const mockPool = mockAgent.get(baseUrl)

  // Disable net connect so we can make sure it matches properly
  mockAgent.disableNetConnect()

  mockPool.intercept({
    path: '/foo',
    method: 'GET',
    headers (headers) {
      t.assert.strictEqual(typeof headers, 'object')
      return !Object.keys(headers).includes('authorization')
    }
  }).reply(200, 'foo').times(3)

  await t.assert.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: {
      Authorization: 'Bearer foo'
    }
  }), new MockNotMatchedError(`Mock dispatch not matched for headers '{"Authorization":"Bearer foo"}' on path '/foo': subsequent request to origin ${baseUrl} was not allowed (net.connect disabled)`))

  await t.assert.rejects(request(`${baseUrl}/foo`, {
    method: 'GET',
    headers: ['Authorization', 'Bearer foo']
  }), new MockNotMatchedError(`Mock dispatch not matched for headers '["Authorization","Bearer foo"]' on path '/foo': subsequent request to origin ${baseUrl} was not allowed (net.connect disabled)`))

  {
    const { statusCode } = await request(`${baseUrl}/foo`, {
      method: 'GET',
      headers: {
        foo: 'bar'
      }
    })
    t.assert.strictEqual(statusCode, 200)
  }

  {
    const { statusCode } = await request(`${baseUrl}/foo`, {
      method: 'GET'
    })
    t.assert.strictEqual(statusCode, 200)
  }
})

test('MockAgent - clients are not garbage collected', async (t) => {
  const samples = 250
  t.plan(2)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.fail('should not be called')
    res.end('should not be called')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  // Create the dispatcher and disable net connect so we can make sure it matches properly
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

  t.assert.strictEqual(results.size, 1)
  t.assert.ok(results.has(200))
})

// https://github.com/nodejs/undici/issues/1321
test('MockAgent - using fetch yields correct statusText', async (t) => {
  t.plan(4)

  const mockAgent = new MockAgent()
  mockAgent.disableNetConnect()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

  const mockPool = mockAgent.get('http://localhost:3000')

  mockPool.intercept({
    path: '/statusText',
    method: 'GET'
  }).reply(200, 'Body')

  const { status, statusText } = await fetch('http://localhost:3000/statusText')

  t.assert.strictEqual(status, 200)
  t.assert.strictEqual(statusText, 'OK')

  mockPool.intercept({
    path: '/unknownStatusText',
    method: 'GET'
  }).reply(420, 'Everyday')

  const unknownStatusCodeRes = await fetch('http://localhost:3000/unknownStatusText')
  t.assert.strictEqual(unknownStatusCodeRes.status, 420)
  t.assert.strictEqual(unknownStatusCodeRes.statusText, 'unknown')
})

// https://github.com/nodejs/undici/issues/1556
test('MockAgent - using fetch yields a headers object in the reply callback', async (t) => {
  t.plan(1)

  const mockAgent = new MockAgent()
  mockAgent.disableNetConnect()
  after(() => mockAgent.close())

  const mockPool = mockAgent.get('http://localhost:3000')

  mockPool.intercept({
    path: '/headers',
    method: 'GET'
  }).reply(200, (opts) => {
    t.assert.deepStrictEqual(opts.headers, {
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
})

// https://github.com/nodejs/undici/issues/1579
test('MockAgent - headers in mock dispatcher intercept should be case-insensitive', async (t) => {
  t.plan(1)

  const mockAgent = new MockAgent()
  mockAgent.disableNetConnect()
  setGlobalDispatcher(mockAgent)
  after(() => mockAgent.close())

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

  t.assert.ok(true, 'end')
})

// https://github.com/nodejs/undici/issues/1757
test('MockAgent - reply callback can be asynchronous', async (t) => {
  t.plan(2)

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

  after(() => mockAgent.close())

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

    t.assert.deepStrictEqual(await response.json(), { foo: 'bar' })
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

    t.assert.deepStrictEqual(await response.json(), { foo: 'bar' })
  }
})

test('MockAgent - headers should be array of strings', async (t) => {
  t.plan(1)

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

  t.assert.deepStrictEqual(headers['set-cookie'], [
    'foo=bar',
    'bar=baz',
    'baz=qux'
  ])
})

// https://github.com/nodejs/undici/issues/2418
test('MockAgent - Sending ReadableStream body', async (t) => {
  t.plan(1)

  const mockAgent = new MockAgent()
  setGlobalDispatcher(mockAgent)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    req.pipe(res)
  })

  after(() => mockAgent.close())
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const url = `http://localhost:${server.address().port}`

  const response = await fetch(url, {
    method: 'POST',
    body: new ReadableStream({
      start (controller) {
        controller.enqueue('test')
        controller.close()
      }
    }),
    duplex: 'half'
  })

  t.assert.deepStrictEqual(await response.text(), 'test')
})

// https://github.com/nodejs/undici/issues/2616
test('MockAgent - headers should be array of strings (fetch)', async (t) => {
  t.plan(1)

  const mockAgent = new MockAgent()
  mockAgent.disableNetConnect()
  setGlobalDispatcher(mockAgent)

  after(() => mockAgent.close())

  const mockPool = mockAgent.get('http://localhost:3000')

  mockPool
    .intercept({
      path: '/foo',
      method: 'GET'
    })
    .reply(200, 'foo', {
      headers: {
        'set-cookie': ['foo=bar', 'bar=baz', 'baz=qux']
      }
    })

  const response = await fetch('http://localhost:3000/foo', {
    method: 'GET'
  })

  t.assert.deepStrictEqual(response.headers.getSetCookie(), ['foo=bar', 'bar=baz', 'baz=qux'])
})

// https://github.com/nodejs/undici/issues/4146
;[
  '/foo?array=item1&array=item2',
  '/foo?array[]=item1&array[]=item2',
  '/foo?array=item1,item2'
].forEach(path => {
  test(`MockAgent - should accept non-standard multi value search parameters when acceptNonStandardSearchParameters is true "${path}"`, async (t) => {
    t.plan(4)

    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.setHeader('content-type', 'text/plain')
      res.end('should not be called')
      t.assert.fail('should not be called')
    })
    after(() => server.close())

    await once(server.listen(0), 'listening')

    const baseUrl = `http://localhost:${server.address().port}`

    const mockAgent = new MockAgent({ acceptNonStandardSearchParameters: true })
    after(() => mockAgent.close())
    const mockPool = mockAgent.get(baseUrl)

    mockPool.intercept({
      path: '/foo',
      method: 'GET',
      query: {
        array: ['item1', 'item2']
      }
    }).reply(200, { foo: 'bar' }, {
      headers: { 'content-type': 'application/json' },
      trailers: { 'Content-MD5': 'test' }
    })

    const { statusCode, headers, trailers, body } = await mockAgent.request({
      origin: baseUrl,
      path,
      method: 'GET'
    })
    t.assert.strictEqual(statusCode, 200)
    t.assert.strictEqual(headers['content-type'], 'application/json')
    t.assert.deepStrictEqual(trailers, { 'content-md5': 'test' })

    const jsonResponse = JSON.parse(await getResponse(body))
    t.assert.deepStrictEqual(jsonResponse, {
      foo: 'bar'
    })
  })
})

test('MockAgent - should not accept non-standard search parameters when acceptNonStandardSearchParameters is false (default)', async (t) => {
  t.plan(2)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('(non-intercepted) response from server')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  after(() => mockAgent.close())
  const mockPool = mockAgent.get(baseUrl)

  mockPool.intercept({
    path: '/foo',
    method: 'GET',
    query: {
      array: ['item1', 'item2']
    }
  }).reply(200, { foo: 'bar' }, {
    headers: { 'content-type': 'application/json' },
    trailers: { 'Content-MD5': 'test' }
  })

  const { statusCode, body } =
  await mockAgent.request({
    origin: baseUrl,
    path: '/foo?array[]=item1&array[]=item2',
    method: 'GET'
  })
  t.assert.strictEqual(statusCode, 200)

  const textResponse = await getResponse(body)
  t.assert.strictEqual(textResponse, '(non-intercepted) response from server')
})

// https://github.com/nodejs/undici/issues/4703
describe('MockAgent - case-insensitive origin matching', () => {
  test('should match origins with different hostname case', async (t) => {
    t.plan(2)

    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const url1 = 'http://myEndpoint'
    const url2 = 'http://myendpoint' // Different case

    const mockPool = mockAgent.get(url1)
    mockPool
      .intercept({
        path: '/test',
        method: 'GET'
      })
      .reply(200, { success: true }, {
        headers: { 'content-type': 'application/json' }
      })

    const { statusCode, body } = await mockAgent.request({
      origin: url2, // Different case should still match
      method: 'GET',
      path: '/test'
    })

    t.assert.strictEqual(statusCode, 200)
    const jsonResponse = JSON.parse(await getResponse(body))
    t.assert.deepStrictEqual(jsonResponse, { success: true })
  })

  test('should match URL object origin with string origin', async (t) => {
    t.plan(2)

    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const url = 'http://myEndpoint'

    const mockPool = mockAgent.get(url)
    mockPool
      .intercept({
        path: '/path',
        method: 'GET'
      })
      .reply(200, { key: 'value' }, {
        headers: { 'content-type': 'application/json' }
      })

    const { statusCode, body } = await mockAgent.request({
      origin: new URL(url), // URL object should match string origin
      method: 'GET',
      path: '/path'
    })

    t.assert.strictEqual(statusCode, 200)
    const jsonResponse = JSON.parse(await getResponse(body))
    t.assert.deepStrictEqual(jsonResponse, { key: 'value' })
  })

  test('should match URL object with different hostname case', async (t) => {
    t.plan(2)

    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const url1 = 'http://Example.com'
    const url2 = new URL('http://example.com') // Different case

    const mockPool = mockAgent.get(url1)
    mockPool
      .intercept({
        path: '/test',
        method: 'GET'
      })
      .reply(200, { success: true }, {
        headers: { 'content-type': 'application/json' }
      })

    const { statusCode, body } = await mockAgent.request({
      origin: url2, // URL object with different case should match
      method: 'GET',
      path: '/test'
    })

    t.assert.strictEqual(statusCode, 200)
    const jsonResponse = JSON.parse(await getResponse(body))
    t.assert.deepStrictEqual(jsonResponse, { success: true })
  })

  test('should handle mixed case scenarios correctly', async (t) => {
    t.plan(2)

    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const url1 = 'http://MyEndpoint.com'
    const url2 = 'http://myendpoint.com' // All lowercase

    const mockPool = mockAgent.get(url1)
    mockPool
      .intercept({
        path: '/api',
        method: 'GET'
      })
      .reply(200, { data: 'test' }, {
        headers: { 'content-type': 'application/json' }
      })

    const { statusCode, body } = await mockAgent.request({
      origin: url2,
      method: 'GET',
      path: '/api'
    })

    t.assert.strictEqual(statusCode, 200)
    const jsonResponse = JSON.parse(await getResponse(body))
    t.assert.deepStrictEqual(jsonResponse, { data: 'test' })
  })

  test('should preserve port numbers when normalizing', async (t) => {
    t.plan(2)

    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const url1 = 'http://Example.com:8080'
    const url2 = 'http://example.com:8080' // Different case, same port

    const mockPool = mockAgent.get(url1)
    mockPool
      .intercept({
        path: '/test',
        method: 'GET'
      })
      .reply(200, { port: 8080 }, {
        headers: { 'content-type': 'application/json' }
      })

    const { statusCode, body } = await mockAgent.request({
      origin: url2,
      method: 'GET',
      path: '/test'
    })

    t.assert.strictEqual(statusCode, 200)
    const jsonResponse = JSON.parse(await getResponse(body))
    t.assert.deepStrictEqual(jsonResponse, { port: 8080 })
  })

  test('should handle https origins with case differences', async (t) => {
    t.plan(2)

    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const url1 = 'https://Api.Example.com'
    const url2 = new URL('https://api.example.com') // Different case

    const mockPool = mockAgent.get(url1)
    mockPool
      .intercept({
        path: '/data',
        method: 'GET'
      })
      .reply(200, { secure: true }, {
        headers: { 'content-type': 'application/json' }
      })

    const { statusCode, body } = await mockAgent.request({
      origin: url2,
      method: 'GET',
      path: '/data'
    })

    t.assert.strictEqual(statusCode, 200)
    const jsonResponse = JSON.parse(await getResponse(body))
    t.assert.deepStrictEqual(jsonResponse, { secure: true })
  })
})
