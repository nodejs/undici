'use strict'

const { tspl } = require('@matteo.collina/tspl')
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
    t = tspl(t, { plan: 1 })
    t.throws(() => new MockPool('http://localhost:9999', { agent: { get: 'not a function' } }), InvalidArgumentError)
  })

  test('sets agent', t => {
    t = tspl(t, { plan: 1 })
    t.doesNotThrow(() => new MockPool('http://localhost:9999', { agent: new MockAgent() }))
  })

  test('should implement the Dispatcher API', t => {
    t = tspl(t, { plan: 1 })

    const mockPool = new MockPool('http://localhost:9999', { agent: new MockAgent() })
    t.ok(mockPool instanceof Dispatcher)
  })
})

describe('MockPool - dispatch', () => {
  test('should handle a single interceptor', (t) => {
    t = tspl(t, { plan: 1 })

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

    t.doesNotThrow(() => mockPool.dispatch({
      path: '/foo',
      method: 'GET'
    }, {
      onHeaders: (_statusCode, _headers, resume) => resume(),
      onData: () => { },
      onComplete: () => { }
    }))
  })

  test('should directly throw error from mockDispatch function if error is not a MockNotMatchedError', (t) => {
    t = tspl(t, { plan: 1 })

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

    t.throws(() => mockPool.dispatch({
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
  t = tspl(t, { plan: 1 })

  const baseUrl = 'http://localhost:9999'

  const mockAgent = new MockAgent()
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)

  const interceptor = mockPool.intercept({
    path: '/foo',
    method: 'GET'
  })

  t.ok(interceptor instanceof MockInterceptor)
})

describe('MockPool - intercept validation', () => {
  test('it should error if no options specified in the intercept', t => {
    t = tspl(t, { plan: 1 })
    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const mockPool = mockAgent.get('http://localhost:9999')

    t.throws(() => mockPool.intercept(), new InvalidArgumentError('opts must be an object'))
  })

  test('it should error if no path specified in the intercept', t => {
    t = tspl(t, { plan: 1 })
    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const mockPool = mockAgent.get('http://localhost:9999')

    t.throws(() => mockPool.intercept({}), new InvalidArgumentError('opts.path must be defined'))
  })

  test('it should default to GET if no method specified in the intercept', t => {
    t = tspl(t, { plan: 1 })
    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const mockPool = mockAgent.get('http://localhost:9999')
    t.doesNotThrow(() => mockPool.intercept({ path: '/foo' }))
  })
})

test('MockPool - close should run without error', async (t) => {
  t = tspl(t, { plan: 1 })

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
  t.ok(true, 'pass')
})

test('MockPool - should be able to set as globalDispatcher', async (t) => {
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

  const mockAgent = new MockAgent()
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  t.ok(mockPool instanceof MockPool)
  setGlobalDispatcher(mockPool)

  mockPool.intercept({
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

test('MockPool - should be able to use as a local dispatcher', async (t) => {
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

  const mockAgent = new MockAgent()
  after(() => mockAgent.close())

  const mockPool = mockAgent.get(baseUrl)
  t.ok(mockPool instanceof MockPool)

  mockPool.intercept({
    path: '/foo',
    method: 'GET'
  }).reply(200, 'hello')

  const { statusCode, body } = await request(`${baseUrl}/foo`, {
    method: 'GET',
    dispatcher: mockPool
  })
  t.strictEqual(statusCode, 200)

  const response = await getResponse(body)
  t.deepStrictEqual(response, 'hello')
})

test('MockPool - basic intercept with MockPool.request', async (t) => {
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

  const mockAgent = new MockAgent()
  after(() => mockAgent.close())
  const mockPool = mockAgent.get(baseUrl)
  t.ok(mockPool instanceof MockPool)

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
  t.strictEqual(statusCode, 200)
  t.strictEqual(headers['content-type'], 'application/json')
  t.deepStrictEqual(trailers, { 'content-md5': 'test' })

  const jsonResponse = JSON.parse(await getResponse(body))
  t.deepStrictEqual(jsonResponse, {
    foo: 'bar'
  })
})

// https://github.com/nodejs/undici/issues/1546
test('MockPool - correct errors when consuming invalid JSON body', async (t) => {
  t = tspl(t, { plan: 1 })

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
  await t.rejects(body.json(), SyntaxError)

  t.end()
})

test('MockPool - allows matching headers in fetch', async (t) => {
  t = tspl(t, { plan: 2 })

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
  await t.rejects(fetch(`${baseUrl}/foo`))

  // not 'accept: application/json', not matched
  await t.rejects(fetch(`${baseUrl}/foo`, {
    headers: {
      accept: 'text/plain'
    }
  }), new TypeError('fetch failed'))
})
