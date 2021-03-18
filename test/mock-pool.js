'use strict'

const { test } = require('tap')
const { createServer } = require('http')
const { promisify } = require('util')
const { MockAgent, MockPool } = require('..')
const { kUrl } = require('../lib/core/symbols')
const { kDispatches } = require('../lib/mock/mock-symbols')
const { InvalidArgumentError } = require('../lib/core/errors')

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

test('MockPool - [kDispatch] should handle a single interceptor', async (t) => {
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

  t.tearDown(mockAgent.close.bind(mockAgent))
  const mockPool = mockAgent.get(baseUrl)

  try {
    this[kUrl] = new URL('http://localhost:9999')
    this[kDispatches] = [
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
    mockPool.dispatch.call(this, {
      path: '/foo',
      method: 'GET'
    }, {
      onHeaders: (_statusCode, _headers, resume) => resume(),
      onData: () => {},
      onComplete: () => {}
    })
    t.ok('called')
  } catch (err) {
    t.fail(err.message)
  }
})
