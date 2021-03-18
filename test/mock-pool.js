'use strict'

const { test } = require('tap')
const { MockAgent, MockPool } = require('..')
const { kUrl } = require('../lib/core/symbols')
const { kDispatches } = require('../lib/mock/mock-symbols')
const { InvalidArgumentError } = require('../lib/core/errors')
const MockInterceptor = require('../lib/mock/mock-interceptor')

test('MockPool - constructor', t => {
  t.plan(2)

  t.test('fails if opts.agent does not implement `get` method', t => {
    t.plan(1)
    t.throw(() => new MockPool('http://localhost:9999', { agent: { get: 'not a function' } }), InvalidArgumentError)
  })

  t.test('sets agent', t => {
    t.plan(1)
    t.notThrow(() => new MockPool('http://localhost:9999', { agent: new MockAgent() }))
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
