'use strict'

const { test, after, describe } = require('node:test')
const { createServer } = require('node:http')
const { promisify } = require('node:util')
const { MockAgent, MockPool, getGlobalDispatcher, setGlobalDispatcher, request } = require('..')
const { kUrl } = require('../lib/core/symbols')
const { kDispatches } = require('../lib/mock/mock-symbols')
const { InvalidArgumentError } = require('../lib/core/errors')
const { MockInterceptor } = require('../lib/mock/mock-interceptor')
const { getResponse } = require('../lib/mock/mock-utils')
const Dispatcher = require('../lib/dispatcher/dispatcher')
const { fetch } = require('..')

describe('MockPool - constructor', () => {
  test('fails if opts.agent does not implement `get` method', t => {
    t.plan(1)
    t.assert.throws(() => new MockPool('http://localhost:9999', { agent: { get: 'not a function' } }), InvalidArgumentError)
  })

  test('sets agent', t => {
    t.plan(1)
    t.assert.doesNotThrow(() => new MockPool('http://localhost:9999', { agent: new MockAgent() }))
  })

  test('should implement the Dispatcher API', t => {
    t.plan(1)

    const mockPool = new MockPool('http://localhost:9999', { agent: new MockAgent() })
    t.assert.ok(mockPool instanceof Dispatcher)
  })
})

describe('MockPool - dispatch', () => {
  test('should handle a single interceptor', (t) => {
    t.plan(1)

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const mockPool = mockAgent.get(baseUrl)

    this[kUrl] = new URL('http://localhost:9999')
    mockPool[kDispatches] = [
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

    t.assert.doesNotThrow(() => mockPool.dispatch({
      path: '/foo',
      method: 'GET'
    }, {
      onHeaders: (_statusCode, _headers, resume) => resume(),
      onData: () => { },
      onComplete: () => { }
    }))
  })

  test('should directly throw error from mockDispatch function if error is not a MockNotMatchedError', (t) => {
    t.plan(1)

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const mockPool = mockAgent.get(baseUrl)

    this[kUrl] = new URL('http://localhost:9999')
    mockPool[kDispatches] = [
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

    t.assert.throws(() => mockPool.dispatch({
      path: '/foo',
      method: 'GET'
    }, {
      onHeaders: (_statusCode, _headers, resume) => { throw new Error('kaboom') },
      onData: () => { },
      onComplete: () => { }
    }), new Error('kaboom'))
  })
})

test('MockPool - intercept should return a MockInterceptor', (t) => {
  t.plan(1)

  const baseUrl = 'http://localhost:9999'

  const mockAgent = new MockAgent()
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)

  const interceptor = mockPool.intercept({
    path: '/foo',
    method: 'GET'
  })

  t.assert.ok(interceptor instanceof MockInterceptor)
})

describe('MockPool - intercept validation', () => {
  test('it should error if no options specified in the intercept', t => {
    t.plan(1)
    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const mockPool = mockAgent.get('http://localhost:9999')

    t.assert.throws(() => mockPool.intercept(), new InvalidArgumentError('opts must be an object'))
  })

  test('it should error if no path specified in the intercept', t => {
    t.plan(1)
    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const mockPool = mockAgent.get('http://localhost:9999')

    t.assert.throws(() => mockPool.intercept({}), new InvalidArgumentError('opts.path must be defined'))
  })

  test('it should default to GET if no method specified in the intercept', t => {
    t.plan(1)
    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const mockPool = mockAgent.get('http://localhost:9999')
    t.assert.doesNotThrow(() => mockPool.intercept({ path: '/foo' }))
  })
})

test('MockPool - close should run without error', async (t) => {
  t.plan(1)

  const baseUrl = 'http://localhost:9999'

  const mockAgent = new MockAgent()
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)

  mockPool[kDispatches] = [
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

  await mockPool.close()
  t.assert.ok(true, 'pass')
})

test('MockPool - should be able to set as globalDispatcher', async (t) => {
  t.plan(3)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  t.assert.ok(mockPool instanceof MockPool)
  setGlobalDispatcher(mockPool)

  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'hello')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.assert.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.assert.deepStrictEqual(response, 'hello')
})

test('MockPool - should be able to use as a local dispatcher', async (t) => {
  t.plan(3)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  t.assert.ok(mockPool instanceof MockPool)

  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'hello')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET',
    dispatcher: mockPool
  })
  t.assert.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.assert.deepStrictEqual(response, 'hello')
})

test('MockPool - basic intercept with MockPool.request', async (t) => {
  t.plan(5)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('should not be called')
    t.assert.fail('should not be called')
  })
  after(() => server.close())

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  after(() => mockAgent.close())
  const mockPool = mockAgent.get(baseUrl)
  t.assert.ok(mockPool instanceof MockPool)

  mockPool.intercept({
    path: '/foo?hello=there&see=ya',
    method: 'POST',
    body: 'form1=data1&form2=data2'
  }).reply(200, { foo: 'bar' }, {
    headers: { 'content-type': 'application/json' },
    trailers: { 'Content-MD5': 'test' }
  })

  const { statusCode, headers, trailers, body } = await mockPool.request({
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

// https://github.com/nodejs/undici/issues/1546
test('MockPool - correct errors when consuming invalid JSON body', async (t) => {
  t.plan(1)

  const oldDispatcher = getGlobalDispatcher()

  const mockAgent = new MockAgent()
  mockAgent.disableNetConnect()
  setGlobalDispatcher(mockAgent)

  after(() => setGlobalDispatcher(oldDispatcher))

  const mockPool = mockAgent.get('https://google.com')
  mockPool.intercept({
    path: 'https://google.com'
  }).reply(200, 'it\'s just a text')

  const { body } = await request('https://google.com')
  await t.assert.rejects(body.json(), SyntaxError)
})

test('MockPool - allows matching headers in fetch', async (t) => {
  t.plan(2)

  const oldDispatcher = getGlobalDispatcher()

  const baseUrl = 'http://localhost:9999'
  const mockAgent = new MockAgent()
  mockAgent.disableNetConnect()
  setGlobalDispatcher(mockAgent)

  after(async () => {
    await mockAgent.close()
    setGlobalDispatcher(oldDispatcher)
  })

  const pool = mockAgent.get(baseUrl)
  pool.intercept({
    path: '/foo',
    method: 'GET',
    headers: {
      accept: 'application/json'
    }
  }).reply(200, { ok: 1 }).times(3)

  await fetch(`${baseUrl}/foo`, {
    headers: {
      accept: 'application/json'
    }
  })

  // no 'accept: application/json' header sent, not matched
  await t.assert.rejects(fetch(`${baseUrl}/foo`))

  // not 'accept: application/json', not matched
  await t.assert.rejects(fetch(`${baseUrl}/foo`, {
    headers: {
      accept: 'text/plain'
    }
  }), new TypeError('fetch failed'))
})

test('MockPool - cleans mocks', async (t) => {
  t.plan(4)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  await promisify(server.listen.bind(server))(0)

  const baseUrl = `http://localhost:${server.address().port}`

  const mockAgent = new MockAgent()
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  t.assert.ok(mockPool instanceof MockPool)
  setGlobalDispatcher(mockPool)

  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(500, () => {
    t.assert.fail('should not be called')
  })

  mockPool.cleanMocks()

  t.assert.strictEqual(mockPool[kDispatches].length, 0)

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET'
  })
  t.assert.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.assert.deepStrictEqual(response, 'hello')
})
