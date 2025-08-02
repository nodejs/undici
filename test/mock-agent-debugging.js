'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, describe } = require('node:test')
const { MockAgent, setGlobalDispatcher, request } = require('..')
const { InvalidArgumentError } = require('../lib/core/errors')

describe('MockAgent - Debugging Features', () => {
  test('should validate new debugging options', t => {
    t = tspl(t, { plan: 6 })

    t.throws(() => new MockAgent({ traceRequests: 'invalid' }), new InvalidArgumentError('options.traceRequests must be a boolean or "verbose"'))
    t.throws(() => new MockAgent({ developmentMode: 'invalid' }), new InvalidArgumentError('options.developmentMode must be a boolean'))
    t.throws(() => new MockAgent({ verboseErrors: 'invalid' }), new InvalidArgumentError('options.verboseErrors must be a boolean'))

    t.doesNotThrow(() => new MockAgent({ traceRequests: true }))
    t.doesNotThrow(() => new MockAgent({ traceRequests: 'verbose' }))
    t.doesNotThrow(() => new MockAgent({ developmentMode: true }))
  })

  test('should enable debugging features in development mode', t => {
    t = tspl(t, { plan: 3 })

    const mockAgent = new MockAgent({ developmentMode: true })
    const debugInfo = mockAgent.debug()

    t.strictEqual(debugInfo.options.developmentMode, true)
    t.strictEqual(debugInfo.options.traceRequests, true)
    t.strictEqual(debugInfo.callHistory.enabled, true)
  })

  test('should provide comprehensive debug information', t => {
    t = tspl(t, { plan: 8 })

    const mockAgent = new MockAgent({ enableCallHistory: true })
    const mockPool = mockAgent.get('http://localhost:3000')

    mockPool.intercept({ path: '/api/users', method: 'GET' }).reply(200, { users: [] })
    mockPool.intercept({ path: '/api/posts', method: 'POST' }).reply(201, { id: 1 })

    const debugInfo = mockAgent.debug()

    t.strictEqual(Array.isArray(debugInfo.origins), true)
    t.strictEqual(debugInfo.origins.includes('http://localhost:3000'), true)
    t.strictEqual(debugInfo.totalInterceptors, 2)
    t.strictEqual(debugInfo.pendingInterceptors, 2)
    t.strictEqual(debugInfo.callHistory.enabled, true)
    t.strictEqual(typeof debugInfo.interceptorsByOrigin, 'object')
    t.strictEqual(debugInfo.isMockActive, true)
    t.strictEqual(Array.isArray(debugInfo.interceptorsByOrigin['http://localhost:3000']), true)
  })

  test('should show interceptor details in debug info', t => {
    t = tspl(t, { plan: 4 })

    const mockAgent = new MockAgent()
    const mockPool = mockAgent.get('http://localhost:3000')

    mockPool.intercept({ path: '/test', method: 'GET' }).reply(200, 'test')

    const debugInfo = mockAgent.debug()
    const interceptors = debugInfo.interceptorsByOrigin['http://localhost:3000']

    t.strictEqual(interceptors.length, 1)
    t.strictEqual(interceptors[0].method, 'GET')
    t.strictEqual(interceptors[0].path, '/test')
    t.strictEqual(interceptors[0].statusCode, 200)
  })

  test('should provide enhanced error messages with context', async t => {
    t = tspl(t, { plan: 3 })

    const mockAgent = new MockAgent()
    setGlobalDispatcher(mockAgent)
    mockAgent.disableNetConnect()

    const mockPool = mockAgent.get('http://localhost:3000')
    mockPool.intercept({ path: '/api/users', method: 'GET' }).reply(200, { users: [] })

    try {
      await request('http://localhost:3000/api/wrong-path')
      t.fail('Should have thrown')
    } catch (error) {
      t.strictEqual(error.name, 'MockNotMatchedError')
      t.ok(error.message.includes('Available interceptors for origin'))
      t.ok(error.message.includes('Request details:'))
    }

    await mockAgent.close()
  })

  test('should trace requests when traceRequests is enabled', async t => {
    t = tspl(t, { plan: 1 })

    const originalConsoleError = console.error
    const loggedMessages = []
    console.error = (...args) => {
      loggedMessages.push(args.join(' '))
    }

    try {
      const mockAgent = new MockAgent({ traceRequests: true })
      setGlobalDispatcher(mockAgent)
      mockAgent.disableNetConnect()

      const mockPool = mockAgent.get('http://localhost:3000')
      mockPool.intercept({ path: '/test', method: 'GET' }).reply(200, 'test')

      await request('http://localhost:3000/test')

      t.ok(loggedMessages.some(msg => msg.includes('[MOCK] Incoming request:')))

      await mockAgent.close()
    } finally {
      console.error = originalConsoleError
    }
  })

  test('should provide inspect method for console output', t => {
    t = tspl(t, { plan: 1 })

    const originalConsoleLog = console.log
    const loggedMessages = []
    console.log = (...args) => {
      loggedMessages.push(args.join(' '))
    }

    try {
      const mockAgent = new MockAgent()
      const mockPool = mockAgent.get('http://localhost:3000')
      mockPool.intercept({ path: '/test', method: 'GET' }).reply(200, 'test')

      mockAgent.inspect()

      t.ok(loggedMessages.some(msg => msg.includes('MockAgent Debug Information')))
    } finally {
      console.log = originalConsoleLog
    }
  })

  test('should provide compareRequest method for interceptor diff analysis', t => {
    t = tspl(t, { plan: 5 })

    const mockAgent = new MockAgent()
    const request = { method: 'GET', path: '/api/user', body: undefined, headers: {} }
    const interceptor = { method: 'GET', path: '/api/users', body: undefined, headers: undefined }

    const comparison = mockAgent.compareRequest(request, interceptor)

    t.strictEqual(typeof comparison, 'object')
    t.strictEqual(comparison.matches, false)
    t.strictEqual(Array.isArray(comparison.differences), true)
    t.strictEqual(comparison.differences.length, 1)
    t.strictEqual(comparison.differences[0].field, 'path')
  })

  test('should validate interceptor configuration', t => {
    t = tspl(t, { plan: 4 })

    const mockAgent = new MockAgent()
    const mockPool = mockAgent.get('http://localhost:3000')
    const interceptor = mockPool.intercept({ path: '/test', method: 'GET' }).reply(200, 'test')

    const validation = interceptor.validate()

    t.strictEqual(typeof validation, 'object')
    t.strictEqual(validation.valid, true)
    t.strictEqual(Array.isArray(validation.issues), true)
    t.strictEqual(typeof validation.interceptor, 'object')
  })

  test('should detect validation issues in interceptor configuration', t => {
    t = tspl(t, { plan: 2 })

    const mockAgent = new MockAgent()
    const mockPool = mockAgent.get('http://localhost:3000')
    const interceptor = mockPool.intercept({ path: '//double-slash', method: 'CUSTOM' }).reply(200, 'test')

    const validation = interceptor.validate()

    t.strictEqual(validation.valid, true) // warnings don't make it invalid
    t.ok(validation.issues.length > 0) // should have at least one warning
  })

  test('should enhance assertNoPendingInterceptors with additional options', async t => {
    t = tspl(t, { plan: 2 })

    const mockAgent = new MockAgent({ enableCallHistory: true })
    setGlobalDispatcher(mockAgent)
    mockAgent.disableNetConnect()

    const mockPool = mockAgent.get('http://localhost:3000')
    mockPool.intercept({ path: '/api/users', method: 'GET' }).reply(200, { users: [] })
    mockPool.intercept({ path: '/api/unused', method: 'POST' }).reply(201, { id: 1 })

    // Make a request to populate call history
    await request('http://localhost:3000/api/users')

    try {
      mockAgent.assertNoPendingInterceptors({
        showUnusedInterceptors: true,
        showCallHistory: true,
        includeRequestDiff: true
      })
      t.fail('Should have thrown')
    } catch (error) {
      t.strictEqual(error.name, 'UndiciError')
      t.ok(error.message.includes('interceptors were never used'))
    }

    await mockAgent.close()
  })
})
