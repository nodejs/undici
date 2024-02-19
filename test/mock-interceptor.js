'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { describe, test, after } = require('node:test')
const { MockInterceptor, MockScope } = require('../lib/mock/mock-interceptor')
const MockAgent = require('../lib/mock/mock-agent')
const { kDispatchKey } = require('../lib/mock/mock-symbols')
const { InvalidArgumentError } = require('../lib/core/errors')

describe('MockInterceptor - path', () => {
  test('should remove hash fragment from paths', t => {
    t = tspl(t, { plan: 1 })
    const mockInterceptor = new MockInterceptor({
      path: '#foobar',
      method: ''
    }, [])
    t.strictEqual(mockInterceptor[kDispatchKey].path, '')
  })
})

describe('MockInterceptor - reply', () => {
  test('should return MockScope', t => {
    t = tspl(t, { plan: 1 })
    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.reply(200, 'hello')
    t.ok(result instanceof MockScope)
  })

  test('should error if passed options invalid', t => {
    t = tspl(t, { plan: 2 })

    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    t.throws(() => mockInterceptor.reply(), new InvalidArgumentError('statusCode must be defined'))
    t.throws(() => mockInterceptor.reply(200, '', 'hello'), new InvalidArgumentError('responseOptions must be an object'))
  })
})

describe('MockInterceptor - reply callback', () => {
  test('should return MockScope', t => {
    t = tspl(t, { plan: 1 })
    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.reply(200, () => 'hello')
    t.ok(result instanceof MockScope)
  })

  test('should error if passed options invalid', t => {
    t = tspl(t, { plan: 3 })

    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    t.throws(() => mockInterceptor.reply(), new InvalidArgumentError('statusCode must be defined'))
    t.throws(() => mockInterceptor.reply(200, () => { }, 'hello'), new InvalidArgumentError('responseOptions must be an object'))
    t.throws(() => mockInterceptor.reply(200, () => { }, null), new InvalidArgumentError('responseOptions must be an object'))
  })
})

describe('MockInterceptor - reply options callback', () => {
  test('should return MockScope', t => {
    t = tspl(t, { plan: 2 })

    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.reply((options) => ({
      statusCode: 200,
      data: 'hello'
    }))
    t.ok(result instanceof MockScope)

    // Test parameters

    const baseUrl = 'http://localhost:9999'
    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const mockPool = mockAgent.get(baseUrl)

    mockPool.intercept({
      path: '/test',
      method: 'GET'
    }).reply((options) => {
      t.deepStrictEqual(options, { path: '/test', method: 'GET', headers: { foo: 'bar' } })
      return { statusCode: 200, data: 'hello' }
    })

    mockPool.dispatch({
      path: '/test',
      method: 'GET',
      headers: { foo: 'bar' }
    }, {
      onHeaders: () => { },
      onData: () => { },
      onComplete: () => { }
    })
  })

  test('should error if passed options invalid', async (t) => {
    t = tspl(t, { plan: 3 })

    const baseUrl = 'http://localhost:9999'
    const mockAgent = new MockAgent()
    after(() => mockAgent.close())

    const mockPool = mockAgent.get(baseUrl)

    mockPool.intercept({
      path: '/test',
      method: 'GET'
    }).reply(() => { })

    mockPool.intercept({
      path: '/test3',
      method: 'GET'
    }).reply(() => ({
      statusCode: 200,
      data: 'hello',
      responseOptions: 42
    }))

    mockPool.intercept({
      path: '/test4',
      method: 'GET'
    }).reply(() => ({
      data: 'hello',
      responseOptions: 42
    }))

    t.throws(() => mockPool.dispatch({
      path: '/test',
      method: 'GET'
    }, {
      onHeaders: () => { },
      onData: () => { },
      onComplete: () => { }
    }), new InvalidArgumentError('reply options callback must return an object'))

    t.throws(() => mockPool.dispatch({
      path: '/test3',
      method: 'GET'
    }, {
      onHeaders: () => { },
      onData: () => { },
      onComplete: () => { }
    }), new InvalidArgumentError('responseOptions must be an object'))

    t.throws(() => mockPool.dispatch({
      path: '/test4',
      method: 'GET'
    }, {
      onHeaders: () => { },
      onData: () => { },
      onComplete: () => { }
    }), new InvalidArgumentError('statusCode must be defined'))
  })
})

describe('MockInterceptor - replyWithError', () => {
  test('should return MockScope', t => {
    t = tspl(t, { plan: 1 })
    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.replyWithError(new Error('kaboom'))
    t.ok(result instanceof MockScope)
  })

  test('should error if passed options invalid', t => {
    t = tspl(t, { plan: 1 })

    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    t.throws(() => mockInterceptor.replyWithError(), new InvalidArgumentError('error must be defined'))
  })
})

describe('MockInterceptor - defaultReplyHeaders', () => {
  test('should return MockInterceptor', t => {
    t = tspl(t, { plan: 1 })
    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.defaultReplyHeaders({})
    t.ok(result instanceof MockInterceptor)
  })

  test('should error if passed options invalid', t => {
    t = tspl(t, { plan: 1 })

    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    t.throws(() => mockInterceptor.defaultReplyHeaders(), new InvalidArgumentError('headers must be defined'))
  })
})

describe('MockInterceptor - defaultReplyTrailers', () => {
  test('should return MockInterceptor', t => {
    t = tspl(t, { plan: 1 })
    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.defaultReplyTrailers({})
    t.ok(result instanceof MockInterceptor)
  })

  test('should error if passed options invalid', t => {
    t = tspl(t, { plan: 1 })

    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    t.throws(() => mockInterceptor.defaultReplyTrailers(), new InvalidArgumentError('trailers must be defined'))
  })
})

describe('MockInterceptor - replyContentLength', () => {
  test('should return MockInterceptor', t => {
    t = tspl(t, { plan: 1 })
    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.defaultReplyTrailers({})
    t.ok(result instanceof MockInterceptor)
  })
})
