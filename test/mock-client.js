'use strict'

const { test } = require('tap')
const { MockAgent, MockClient } = require('..')
const { kUrl } = require('../lib/core/symbols')
const { kDispatches } = require('../lib/mock/mock-symbols')
const { InvalidArgumentError } = require('../lib/core/errors')
const MockInterceptor = require('../lib/mock/mock-interceptor')

test('MockClient - constructor', t => {
  t.plan(2)

  t.test('fails if opts.agent does not implement `get` method', t => {
    t.plan(1)
    t.throw(() => new MockClient('http://localhost:9999', { agent: { get: 'not a function' } }), InvalidArgumentError)
  })

  t.test('sets agent', t => {
    t.plan(1)
    t.notThrow(() => new MockClient('http://localhost:9999', { agent: new MockAgent({ connections: 1 }) }))
  })
})

test('MockClient - dispatch', t => {
  t.plan(1)

  t.test('should handle a single interceptor', (t) => {
    t.plan(1)

    const baseUrl = 'http://localhost:9999'

    const mockAgent = new MockAgent({ connections: 1 })
    t.tearDown(mockAgent.close.bind(mockAgent))

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

    t.notThrow(() => mockClient.dispatch({
      path: '/foo',
      method: 'GET'
    }, {
      onHeaders: (_statusCode, _headers, resume) => resume(),
      onData: () => {},
      onComplete: () => {}
    }))
  })
})

test('MockClient - intercept should return a MockInterceptor', (t) => {
  t.plan(1)

  const baseUrl = 'http://localhost:9999'

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

  const mockClient = mockAgent.get(baseUrl)

  const interceptor = mockClient.intercept({
    path: '/foo',
    method: 'GET'
  })

  t.true(interceptor instanceof MockInterceptor)
})

test('MockClient - intercept validation', (t) => {
  t.plan(3)

  t.test('it should error if no options specified in the intercept', t => {
    t.plan(1)
    const mockAgent = new MockAgent({ connections: 1 })
    t.tearDown(mockAgent.close.bind(mockAgent))

    const mockPool = mockAgent.get('http://localhost:9999')

    t.throw(() => mockPool.intercept(), new InvalidArgumentError('opts must be an object'))
  })

  t.test('it should error if no path specified in the intercept', t => {
    t.plan(1)
    const mockAgent = new MockAgent({ connections: 1 })
    t.tearDown(mockAgent.close.bind(mockAgent))

    const mockPool = mockAgent.get('http://localhost:9999')

    t.throw(() => mockPool.intercept({}), new InvalidArgumentError('opts.path must be defined'))
  })

  t.test('it should error if no method specified in the intercept', t => {
    t.plan(1)
    const mockAgent = new MockAgent({ connections: 1 })
    t.tearDown(mockAgent.close.bind(mockAgent))

    const mockPool = mockAgent.get('http://localhost:9999')

    t.throw(() => mockPool.intercept({ path: '/foo' }), new InvalidArgumentError('opts.method must be defined'))
  })
})

test('MockClient - close should run without error', async (t) => {
  t.plan(1)

  const baseUrl = 'http://localhost:9999'

  const mockAgent = new MockAgent({ connections: 1 })
  t.tearDown(mockAgent.close.bind(mockAgent))

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

  await t.resolves(mockClient.close())
})
