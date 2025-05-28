'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after, describe } = require('node:test')
const { createServer } = require('node:http')
const { promisify } = require('node:util')
const { MockAgent, MockClient, setGlobalDispatcher, request } = require('..')
const { kUrl } = require('../lib/core/symbols')
const { kDispatches } = require('../lib/mock/mock-symbols')
const { InvalidArgumentError } = require('../lib/core/errors')
const { MockInterceptor } = require('../lib/mock/mock-interceptor')
const { getResponse } = require('../lib/mock/mock-utils')
const Dispatcher = require('../lib/dispatcher/dispatcher')

describe('MockClient - constructor', () => {
  test('fails if opts.agent does not implement `get` method', t => {
    t = tspl(t, { plan: 1 })
    t.throws(() => new MockClient('http://localhost:9999', { agent: { get: 'not a function' } }), InvalidArgumentError)
  })

  test('sets agent', t => {
    t = tspl(t, { plan: 1 })
    t.doesNotThrow(() => new MockClient('http://localhost:9999', { agent: new MockAgent({ connections: 1 }) }))
  })

  test('should implement the Dispatcher API', t => {
    t = tspl(t, { plan: 1 })

    const mockClient = new MockClient('http://localhost:9999', { agent: new MockAgent({ connections: 1 }) })
    t.ok(mockClient instanceof Dispatcher)
  })
})

describe('MockClient - dispatch', () => {
  test('should handle a single interceptor', (t) => {
    t = tspl(t, { plan: 1 })

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent({ connections: 1 })
    after(() => mockAgent.close())

    const mockClient = mockAgent.get(baseUrl)

    this[kUrl] = new URL('http://localhost:9999')
    mockClient[kDispatches] = [
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

    t.doesNotThrow(() => mockClient.dispatch({
      path: '/foo',
      method: 'GET'
    }, {
      onHeaders: (_statusCode, _headers, resume) => resume(),
      onData: () => {},
      onComplete: () => {}
    }))
  })

  test('should directly throw error from mockDispatch function if error is not a MockNotMatchedError', (t) => {
    t = tspl(t, { plan: 1 })

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent({ connections: 1 })
    after(() => mockAgent.close())

    const mockClient = mockAgent.get(baseUrl)

    this[kUrl] = new URL('http://localhost:9999')
    mockClient[kDispatches] = [
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

    t.throws(() => mockClient.dispatch({
      path: '/foo',
      method: 'GET'
    }, {
      onHeaders: (_statusCode, _headers, resume) => { throw new Error('kaboom') },
      onData: () => {},
      onComplete: () => {}
    }), new Error('kaboom'))
  })
})

test('MockClient - intercept should return a MockInterceptor', (t) => {
  t = tspl(t, { plan: 1 })

  const baseUrl = 'http://localhost:9999'

  const mockAgent = new MockAgent({ connections: 1 })
  after(() => mockAgent.close())

  const mockClient = mockAgent.get(baseUrl)

  const interceptor = mockClient.intercept({
    path: '/foo',
    method: 'GET'
  })

  t.ok(interceptor instanceof MockInterceptor)
})

describe('MockClient - intercept validation', () => {
  test('it should error if no options specified in the intercept', t => {
    t = tspl(t, { plan: 1 })
    const mockAgent = new MockAgent({ connections: 1 })
    after(() => mockAgent.close())

    const mockClient = mockAgent.get('http://localhost:9999')

    t.throws(() => mockClient.intercept(), new InvalidArgumentError('opts must be an object'))
  })

  test('it should error if no path specified in the intercept', t => {
    t = tspl(t, { plan: 1 })
    const mockAgent = new MockAgent({ connections: 1 })
    after(() => mockAgent.close())

    const mockClient = mockAgent.get('http://localhost:9999')

    t.throws(() => mockClient.intercept({}), new InvalidArgumentError('opts.path must be defined'))
  })

  test('it should default to GET if no method specified in the intercept', t => {
    t = tspl(t, { plan: 1 })
    const mockAgent = new MockAgent({ connections: 1 })
    after(() => mockAgent.close())

    const mockClient = mockAgent.get('http://localhost:9999')
    t.doesNotThrow(() => mockClient.intercept({ path: '/foo' }))
  })

  test('it should uppercase the method - https://github.com/nodejs/undici/issues/1320', t => {
    t = tspl(t, { plan: 1 })

    const mockAgent = new MockAgent()
    const mockClient = mockAgent.get('http://localhost:3000')

    after(() => mockAgent.close())

    mockClient.intercept({
      path: '/test',
      method: 'patch'
    }).reply(200, 'Hello!')

    t.strictEqual(mockClient[kDispatches][0].method, 'PATCH')
  })
})

test('MockClient - close should run without error', async (t) => {
  t = tspl(t, { plan: 1 })

  const baseUrl = 'http://localhost:9999'

  const mockAgent = new MockAgent({ connections: 1 })
  after(() => mockAgent.close())

  const mockClient = mockAgent.get(baseUrl)
  mockClient[kDispatches] = [
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

  await mockClient.close()
  t.ok(true, 'pass')
})

test('MockClient - should be able to set as globalDispatcher', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  after(() => server.close())

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent({ connections: 1 })
  after(() => mockAgent.close())

  const mockClient = mockAgent.get(baseUrl)
  t.ok(mockClient instanceof MockClient)
  setGlobalDispatcher(mockClient)

  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'hello')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.deepStrictEqual(response, 'hello')
})

test('MockClient - should support query params', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  after(() => server.close())

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent({ connections: 1 })
  after(() => mockAgent.close())

  const mockClient = mockAgent.get(baseUrl)
  t.ok(mockClient instanceof MockClient)
  setGlobalDispatcher(mockClient)

  const query = {
    pageNum: 1
  }
  mockClient.intercept({
    path: '/foo',
    query,
    method: 'GET'
  }).reply(200, 'hello')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET',
    query
  })
  t.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.deepStrictEqual(response, 'hello')
})

test('MockClient - should intercept query params with hardcoded path', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  after(() => server.close())

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent({ connections: 1 })
  after(() => mockAgent.close())

  const mockClient = mockAgent.get(baseUrl)
  t.ok(mockClient instanceof MockClient)
  setGlobalDispatcher(mockClient)

  const query = {
    pageNum: 1
  }
  mockClient.intercept({
    path: '/foo?pageNum=1',
    method: 'GET'
  }).reply(200, 'hello')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET',
    query
  })
  t.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.deepStrictEqual(response, 'hello')
})

test('MockClient - should intercept query params regardless of key ordering', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  after(() => server.close())

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent({ connections: 1 })
  after(() => mockAgent.close())

  const mockClient = mockAgent.get(baseUrl)
  t.ok(mockClient instanceof MockClient)
  setGlobalDispatcher(mockClient)

  const query = {
    pageNum: 1,
    limit: 100,
    ordering: [false, true]
  }

  mockClient.intercept({
    path: '/foo',
    query: {
      ordering: query.ordering,
      pageNum: query.pageNum,
      limit: query.limit
    },
    method: 'GET'
  }).reply(200, 'hello')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET',
    query
  })
  t.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.deepStrictEqual(response, 'hello')
})

test('MockClient - should be able to use as a local dispatcher', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  after(() => server.close())

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent({ connections: 1 })
  after(() => mockAgent.close())

  const mockClient = mockAgent.get(baseUrl)
  t.ok(mockClient instanceof MockClient)

  mockClient.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'hello')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET',
    dispatcher: mockClient
  })
  t.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.deepStrictEqual(response, 'hello')
})

test('MockClient - basic intercept with MockClient.request', async (t) => {
  t = tspl(t, { plan: 5 })

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.fail('should not be called')
    t.end()
  })
  after(() => server.close())

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent({ connections: 1 })
  after(() => mockAgent.close())
  const mockClient = mockAgent.get(baseUrl)
  t.ok(mockClient instanceof MockClient)

  mockClient.intercept({
    path: '/foo?hello=there&see=ya',
    method: 'POST',
    body: 'form1=data1&form2=data2'
  }).reply(200, { foo: 'bar' }, {
    headers: { 'content-type': 'application/json' },
    trailers: { 'Content-MD5': 'test' }
  })

  const { statusCode, headers, trailers, body } = await mockClient.request({
    origin: baseUrl,
    path: '/foo?hello=there&see=ya',
    method: 'POST',
    body: 'form1=data1&form2=data2'
  })
  t.strictEqual(statusCode, 200)
  t.strictEqual(headers['content-type'], 'application/json')
  t.deepStrictEqual(trailers, { 'content-md5': 'test' })

  const jsonResponse = JSON.parse(await getResponse(body))
  t.deepStrictEqual(jsonResponse, {
    foo: 'bar'
  })
})
