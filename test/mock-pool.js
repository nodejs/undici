'use strict'

const { test } = require('tap')
const { createServer } = require('http')
const { promisify } = require('util')
const { MockAgent, MockPool, setGlobalDispatcher, request } = require('..')
const { kUrl } = require('../lib/core/symbols')
const { kDispatches } = require('../lib/mock/mock-symbols')
const { InvalidArgumentError } = require('../lib/core/errors')
const { MockInterceptor } = require('../lib/mock/mock-interceptor')
const { getResponse } = require('../lib/mock/mock-utils')
const Dispatcher = require('../lib/dispatcher')

test('MockPool - constructor', t => {
  t.plan(3)

  t.test('fails if opts.agent does not implement `get` method', t => {
    t.plan(1)
    t.throw(() => new MockPool('http://localhost:9999', { agent: { get: 'not a function' } }), InvalidArgumentError)
  })

  t.test('sets agent', t => {
    t.plan(1)
    t.notThrow(() => new MockPool('http://localhost:9999', { agent: new MockAgent() }))
  })

  t.test('should implement the Dispatcher API', t => {
    t.plan(1)

    const mockPool = new MockPool('http://localhost:9999', { agent: new MockAgent() })
    t.true(mockPool instanceof Dispatcher)
  })
})

test('MockPool - dispatch', t => {
  t.plan(1)

  t.test('should handle a single interceptor', (t) => {
    t.plan(1)

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent()
    t.tearDown(mockAgent.close.bind(mockAgent))

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

    t.notThrow(() => mockPool.dispatch({
      path: '/foo',
      method: 'GET'
    }, {
      onHeaders: (_statusCode, _headers, resume) => resume(),
      onData: () => {},
      onComplete: () => {}
    }))
  })
})

test('MockPool - intercept should return a MockInterceptor', (t) => {
  t.plan(1)

  const baseUrl = 'http://localhost:9999'

  const mockAgent = new MockAgent()
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)

  const interceptor = mockPool.intercept({
    path: '/foo',
    method: 'GET'
  })

  t.true(interceptor instanceof MockInterceptor)
})

test('MockPool - intercept validation', (t) => {
  t.plan(3)

  t.test('it should error if no options specified in the intercept', t => {
    t.plan(1)
    const mockAgent = new MockAgent()
    t.tearDown(mockAgent.close.bind(mockAgent))

    const mockPool = mockAgent.get('http://localhost:9999')

    t.throw(() => mockPool.intercept(), new InvalidArgumentError('opts must be an object'))
  })

  t.test('it should error if no path specified in the intercept', t => {
    t.plan(1)
    const mockAgent = new MockAgent()
    t.tearDown(mockAgent.close.bind(mockAgent))

    const mockPool = mockAgent.get('http://localhost:9999')

    t.throw(() => mockPool.intercept({}), new InvalidArgumentError('opts.path must be defined'))
  })

  t.test('it should error if no method specified in the intercept', t => {
    t.plan(1)
    const mockAgent = new MockAgent()
    t.tearDown(mockAgent.close.bind(mockAgent))

    const mockPool = mockAgent.get('http://localhost:9999')

    t.throw(() => mockPool.intercept({ path: '/foo' }), new InvalidArgumentError('opts.method must be defined'))
  })
})

test('MockPool - close should run without error', async (t) => {
  t.plan(1)

  const baseUrl = 'http://localhost:9999'

  const mockAgent = new MockAgent()
  t.tearDown(mockAgent.close.bind(mockAgent))

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

  await t.resolves(mockPool.close())
})

test('MockPool - should be able to set as globalDispatcher', async (t) => {
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
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  t.true(mockPool instanceof MockPool)
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
  t.deepEqual(response, 'hello')
})

test('MockPool - should be able to use as a local dispatcher', async (t) => {
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
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockPool = mockAgent.get(baseUrl)
  t.true(mockPool instanceof MockPool)

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
  t.deepEqual(response, 'hello')
})
