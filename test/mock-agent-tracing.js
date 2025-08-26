'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, describe } = require('node:test')
const { MockAgent, setGlobalDispatcher, request } = require('..')
const { InvalidArgumentError } = require('../lib/core/errors')

describe('MockAgent - Tracing with Configurable Console', () => {
  test('should validate console option', t => {
    t = tspl(t, { plan: 4 })

    t.throws(() => new MockAgent({ console: 'invalid' }), new InvalidArgumentError('options.console must be an object with an error method'))
    t.throws(() => new MockAgent({ console: null }), new InvalidArgumentError('options.console must be an object with an error method'))
    t.throws(() => new MockAgent({ console: {} }), new InvalidArgumentError('options.console must be an object with an error method'))

    t.doesNotThrow(() => new MockAgent({ console: { error: () => {} } }))
  })

  test('should use custom console for basic tracing on successful match', async t => {
    t = tspl(t, { plan: 3 })

    const mockConsole = {
      messages: [],
      error: function (...args) {
        this.messages.push(args.join(' '))
      }
    }

    const mockAgent = new MockAgent({
      traceRequests: true,
      console: mockConsole
    })
    setGlobalDispatcher(mockAgent)
    mockAgent.disableNetConnect()

    const mockPool = mockAgent.get('http://localhost:3000')
    mockPool.intercept({ path: '/test', method: 'GET' }).reply(200, 'test-response')

    await request('http://localhost:3000/test')

    t.strictEqual(mockConsole.messages.length, 2)
    t.ok(mockConsole.messages[0].includes('[MOCK] Incoming request: GET http://localhost:3000/test'))
    t.ok(mockConsole.messages[1].includes('[MOCK] ✅ MATCHED interceptor: GET /test -> 200'))

    await mockAgent.close()
  })

  test('should use custom console for basic tracing on failed match', async t => {
    t = tspl(t, { plan: 4 })

    const mockConsole = {
      messages: [],
      error: function (...args) {
        this.messages.push(args.join(' '))
      }
    }

    const mockAgent = new MockAgent({
      traceRequests: true,
      console: mockConsole
    })
    setGlobalDispatcher(mockAgent)
    mockAgent.disableNetConnect()

    const mockPool = mockAgent.get('http://localhost:3000')
    mockPool.intercept({ path: '/correct-path', method: 'GET' }).reply(200, 'test')

    try {
      await request('http://localhost:3000/wrong-path')
      t.fail('Should have thrown')
    } catch (error) {
      t.ok(error.message.includes('Mock dispatch not matched'))
    }

    t.ok(mockConsole.messages.length >= 2)
    t.ok(mockConsole.messages.some(msg => msg.includes('[MOCK] Incoming request: GET http://localhost:3000/wrong-path')))
    t.ok(mockConsole.messages.some(msg => msg.includes('[MOCK] ❌ NO MATCH found for: GET /wrong-path')))

    await mockAgent.close()
  })

  test('should use custom console for verbose tracing on successful match', async t => {
    t = tspl(t, { plan: 8 })

    const mockConsole = {
      messages: [],
      error: function (...args) {
        this.messages.push(args.join(' '))
      }
    }

    const mockAgent = new MockAgent({
      traceRequests: 'verbose',
      console: mockConsole
    })
    setGlobalDispatcher(mockAgent)
    mockAgent.disableNetConnect()

    const mockPool = mockAgent.get('http://localhost:3000')
    mockPool.intercept({ path: '/test', method: 'POST' }).reply(201, { id: 1 }, { headers: { 'content-type': 'application/json' } })

    await request('http://localhost:3000/test', {
      method: 'POST',
      body: JSON.stringify({ name: 'test' }),
      headers: { 'content-type': 'application/json' }
    })

    t.ok(mockConsole.messages.length >= 7)
    t.ok(mockConsole.messages.some(msg => msg.includes('[MOCK] 🔍 Request received:')))
    t.ok(mockConsole.messages.some(msg => msg.includes('Method: POST')))
    t.ok(mockConsole.messages.some(msg => msg.includes('URL: http://localhost:3000/test')))
    t.ok(mockConsole.messages.some(msg => msg.includes('Body: {"name":"test"}')))
    t.ok(mockConsole.messages.some(msg => msg.includes('[MOCK] 🔎 Checking interceptors for origin')))
    t.ok(mockConsole.messages.some(msg => msg.includes('✅ MATCH!')))
    t.ok(mockConsole.messages.some(msg => msg.includes('[MOCK] ✅ Responding with:')))

    await mockAgent.close()
  })

  test('should use custom console for verbose tracing on failed match with interceptors', async t => {
    t = tspl(t, { plan: 6 })

    const mockConsole = {
      messages: [],
      error: function (...args) {
        this.messages.push(args.join(' '))
      }
    }

    const mockAgent = new MockAgent({
      traceRequests: 'verbose',
      console: mockConsole
    })
    setGlobalDispatcher(mockAgent)
    mockAgent.disableNetConnect()

    const mockPool = mockAgent.get('http://localhost:3000')
    mockPool.intercept({ path: '/users', method: 'GET' }).reply(200, [])
    mockPool.intercept({ path: '/posts', method: 'GET' }).reply(200, [])
    mockPool.intercept({ path: '/comments', method: 'GET' }).reply(200, [])

    try {
      await request('http://localhost:3000/wrong-endpoint')
      t.fail('Should have thrown')
    } catch (error) {
      t.ok(error.message.includes('Mock dispatch not matched'))
    }

    t.ok(mockConsole.messages.length >= 5)
    t.ok(mockConsole.messages.some(msg => msg.includes('[MOCK] 🔍 Request received:')))
    t.ok(mockConsole.messages.some(msg => msg.includes('Method: GET')))
    t.ok(mockConsole.messages.some(msg => msg.includes('[MOCK] ❌ NO MATCH found')))
    t.ok(mockConsole.messages.some(msg => msg.includes('Available interceptors (3):')))

    await mockAgent.close()
  })

  test('should show similar interceptors in basic mode', async t => {
    t = tspl(t, { plan: 4 })

    const mockConsole = {
      messages: [],
      error: function (...args) {
        this.messages.push(args.join(' '))
      }
    }

    const mockAgent = new MockAgent({
      traceRequests: true,
      console: mockConsole
    })
    setGlobalDispatcher(mockAgent)
    mockAgent.disableNetConnect()

    const mockPool = mockAgent.get('http://localhost:3000')
    mockPool.intercept({ path: '/api/users', method: 'GET' }).reply(200, [])
    mockPool.intercept({ path: '/api/posts', method: 'POST' }).reply(201, {})

    try {
      await request('http://localhost:3000/api/user') // Very similar to /api/users
      t.fail('Should have thrown')
    } catch (error) {
      t.ok(error.message.includes('Mock dispatch not matched'))
    }

    t.ok(mockConsole.messages.length >= 2)
    t.ok(mockConsole.messages.some(msg => msg.includes('[MOCK] ❌ NO MATCH found')))
    t.ok(mockConsole.messages.some(msg => msg.includes('[MOCK] Available interceptors:')))

    await mockAgent.close()
  })

  test('should trace with headers in verbose mode', async t => {
    t = tspl(t, { plan: 3 })

    const mockConsole = {
      messages: [],
      error: function (...args) {
        this.messages.push(args.join(' '))
      }
    }

    const mockAgent = new MockAgent({
      traceRequests: 'verbose',
      console: mockConsole
    })
    setGlobalDispatcher(mockAgent)
    mockAgent.disableNetConnect()

    const mockPool = mockAgent.get('http://localhost:3000')
    mockPool.intercept({ path: '/test', method: 'GET' }).reply(200, 'test')

    await request('http://localhost:3000/test', {
      headers: {
        'user-agent': 'test-agent',
        accept: 'application/json'
      }
    })

    t.ok(mockConsole.messages.length >= 5)
    t.ok(mockConsole.messages.some(msg => msg.includes('Headers:')))
    t.ok(mockConsole.messages.some(msg => msg.includes('user-agent')))

    await mockAgent.close()
  })

  test('should trace with request body in verbose mode', async t => {
    t = tspl(t, { plan: 3 })

    const mockConsole = {
      messages: [],
      error: function (...args) {
        this.messages.push(args.join(' '))
      }
    }

    const mockAgent = new MockAgent({
      traceRequests: 'verbose',
      console: mockConsole
    })
    setGlobalDispatcher(mockAgent)
    mockAgent.disableNetConnect()

    const mockPool = mockAgent.get('http://localhost:3000')
    mockPool.intercept({ path: '/test', method: 'POST' }).reply(200, 'test')

    await request('http://localhost:3000/test', {
      method: 'POST',
      body: 'request body data'
    })

    t.ok(mockConsole.messages.length >= 5)
    t.ok(mockConsole.messages.some(msg => msg.includes('Body: request body data')))
    t.ok(mockConsole.messages.some(msg => msg.includes('✅ MATCH!')))

    await mockAgent.close()
  })

  test('should trace response headers in verbose mode', async t => {
    t = tspl(t, { plan: 3 })

    const mockConsole = {
      messages: [],
      error: function (...args) {
        this.messages.push(args.join(' '))
      }
    }

    const mockAgent = new MockAgent({
      traceRequests: 'verbose',
      console: mockConsole
    })
    setGlobalDispatcher(mockAgent)
    mockAgent.disableNetConnect()

    const mockPool = mockAgent.get('http://localhost:3000')
    mockPool.intercept({ path: '/test', method: 'GET' }).reply(200, 'test', {
      headers: {
        'content-type': 'text/plain',
        'x-custom-header': 'custom-value'
      }
    })

    await request('http://localhost:3000/test')

    t.ok(mockConsole.messages.length >= 6)
    t.ok(mockConsole.messages.some(msg => msg.includes('[MOCK] ✅ Responding with:')))
    t.ok(mockConsole.messages.some(msg => msg.includes('content-type')))

    await mockAgent.close()
  })

  test('should not trace when traceRequests is disabled', async t => {
    t = tspl(t, { plan: 1 })

    const mockConsole = {
      messages: [],
      error: function (...args) {
        this.messages.push(args.join(' '))
      }
    }

    const mockAgent = new MockAgent({
      traceRequests: false,
      console: mockConsole
    })
    setGlobalDispatcher(mockAgent)
    mockAgent.disableNetConnect()

    const mockPool = mockAgent.get('http://localhost:3000')
    mockPool.intercept({ path: '/test', method: 'GET' }).reply(200, 'test')

    await request('http://localhost:3000/test')

    t.strictEqual(mockConsole.messages.length, 0)

    await mockAgent.close()
  })

  test('should fall back to global console when no custom console provided', async t => {
    t = tspl(t, { plan: 2 })

    const originalConsoleError = console.error
    const globalMessages = []
    console.error = (...args) => {
      globalMessages.push(args.join(' '))
    }

    try {
      const mockAgent = new MockAgent({ traceRequests: true })
      setGlobalDispatcher(mockAgent)
      mockAgent.disableNetConnect()

      const mockPool = mockAgent.get('http://localhost:3000')
      mockPool.intercept({ path: '/test', method: 'GET' }).reply(200, 'test')

      await request('http://localhost:3000/test')

      t.ok(globalMessages.length >= 2)
      t.ok(globalMessages.some(msg => msg.includes('[MOCK] Incoming request:')))

      await mockAgent.close()
    } finally {
      console.error = originalConsoleError
    }
  })

  test('should handle empty interceptor list gracefully', async t => {
    t = tspl(t, { plan: 3 })

    const mockConsole = {
      messages: [],
      error: function (...args) {
        this.messages.push(args.join(' '))
      }
    }

    const mockAgent = new MockAgent({
      traceRequests: 'verbose',
      console: mockConsole
    })
    setGlobalDispatcher(mockAgent)
    mockAgent.disableNetConnect()

    try {
      await request('http://localhost:3000/test')
      t.fail('Should have thrown')
    } catch (error) {
      t.ok(error.message.includes('Mock dispatch not matched'))
    }

    t.ok(mockConsole.messages.length >= 3)
    t.ok(mockConsole.messages.some(msg => msg.includes('[MOCK] ❌ NO MATCH found')))

    await mockAgent.close()
  })

  test('should trace multiple requests correctly', async t => {
    t = tspl(t, { plan: 4 })

    const mockConsole = {
      messages: [],
      error: function (...args) {
        this.messages.push(args.join(' '))
      }
    }

    const mockAgent = new MockAgent({
      traceRequests: true,
      console: mockConsole
    })
    setGlobalDispatcher(mockAgent)
    mockAgent.disableNetConnect()

    const mockPool = mockAgent.get('http://localhost:3000')
    mockPool.intercept({ path: '/test1', method: 'GET' }).reply(200, 'test1')
    mockPool.intercept({ path: '/test2', method: 'GET' }).reply(200, 'test2')

    await request('http://localhost:3000/test1')
    await request('http://localhost:3000/test2')

    t.ok(mockConsole.messages.length >= 4)
    t.ok(mockConsole.messages.some(msg => msg.includes('/test1')))
    t.ok(mockConsole.messages.some(msg => msg.includes('/test2')))
    t.ok(mockConsole.messages.filter(msg => msg.includes('✅ MATCHED')).length >= 2)

    await mockAgent.close()
  })
})
