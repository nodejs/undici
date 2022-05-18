'use strict'

const { test } = require('tap')
const { MockInterceptor, MockScope } = require('../lib/mock/mock-interceptor')
const MockAgent = require('../lib/mock/mock-agent')
const { kDispatchKey } = require('../lib/mock/mock-symbols')
const { InvalidArgumentError } = require('../lib/core/errors')

test('MockInterceptor - path', t => {
  t.plan(1)
  t.test('should remove hash fragment from paths', t => {
    t.plan(1)
    const mockInterceptor = new MockInterceptor({
      path: '#foobar',
      method: ''
    }, [])
    t.equal(mockInterceptor[kDispatchKey].path, '')
  })
})

test('MockInterceptor - reply', t => {
  t.plan(2)

  t.test('should return MockScope', t => {
    t.plan(1)
    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.reply(200, 'hello')
    t.type(result, MockScope)
  })

  t.test('should error if passed options invalid', t => {
    t.plan(3)

    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    t.throws(() => mockInterceptor.reply(), new InvalidArgumentError('statusCode must be defined'))
    t.throws(() => mockInterceptor.reply(200), new InvalidArgumentError('data must be defined'))
    t.throws(() => mockInterceptor.reply(200, '', 'hello'), new InvalidArgumentError('responseOptions must be an object'))
  })
})

test('MockInterceptor - reply callback', t => {
  t.plan(2)

  t.test('should return MockScope', t => {
    t.plan(1)
    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.reply(200, () => 'hello')
    t.type(result, MockScope)
  })

  t.test('should error if passed options invalid', t => {
    t.plan(2)

    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    t.throws(() => mockInterceptor.reply(), new InvalidArgumentError('statusCode must be defined'))
    t.throws(() => mockInterceptor.reply(200, () => {}, 'hello'), new InvalidArgumentError('responseOptions must be an object'))
  })
})

test('MockInterceptor - reply options callback', t => {
  t.plan(2)

  t.test('should return MockScope', t => {
    t.plan(2)

    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.reply((options) => ({
      statusCode: 200,
      data: 'hello'
    }))
    t.type(result, MockScope)

    // Test parameters

    const baseUrl = 'http://localhost:9999'
    const mockAgent = new MockAgent()
    t.teardown(mockAgent.close.bind(mockAgent))

    const mockPool = mockAgent.get(baseUrl)

    mockPool.intercept({
      path: '/test',
      method: 'GET'
    }).reply((options) => {
      t.strictSame(options, { path: '/test', method: 'GET', headers: { foo: 'bar' } })
      return { statusCode: 200, data: 'hello' }
    })

    mockPool.dispatch({
      path: '/test',
      method: 'GET',
      headers: { foo: 'bar' }
    }, {
      onHeaders: () => {},
      onData: () => {},
      onComplete: () => {}
    })
  })

  t.test('should error if passed options invalid', async (t) => {
    t.plan(4)

    const baseUrl = 'http://localhost:9999'
    const mockAgent = new MockAgent()
    t.teardown(mockAgent.close.bind(mockAgent))

    const mockPool = mockAgent.get(baseUrl)

    mockPool.intercept({
      path: '/test',
      method: 'GET'
    }).reply(() => {})

    mockPool.intercept({
      path: '/test2',
      method: 'GET'
    }).reply(() => ({
      statusCode: 200
    }))

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
      onHeaders: () => {},
      onData: () => {},
      onComplete: () => {}
    }), new InvalidArgumentError('reply options callback must return an object'))

    t.throws(() => mockPool.dispatch({
      path: '/test2',
      method: 'GET'
    }, {
      onHeaders: () => {},
      onData: () => {},
      onComplete: () => {}
    }), new InvalidArgumentError('data must be defined'))

    t.throws(() => mockPool.dispatch({
      path: '/test3',
      method: 'GET'
    }, {
      onHeaders: () => {},
      onData: () => {},
      onComplete: () => {}
    }), new InvalidArgumentError('responseOptions must be an object'))

    t.throws(() => mockPool.dispatch({
      path: '/test4',
      method: 'GET'
    }, {
      onHeaders: () => {},
      onData: () => {},
      onComplete: () => {}
    }), new InvalidArgumentError('statusCode must be defined'))
  })
})

test('MockInterceptor - replyWithError', t => {
  t.plan(2)

  t.test('should return MockScope', t => {
    t.plan(1)
    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.replyWithError(new Error('kaboom'))
    t.type(result, MockScope)
  })

  t.test('should error if passed options invalid', t => {
    t.plan(1)

    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    t.throws(() => mockInterceptor.replyWithError(), new InvalidArgumentError('error must be defined'))
  })
})

test('MockInterceptor - defaultReplyHeaders', t => {
  t.plan(2)

  t.test('should return MockInterceptor', t => {
    t.plan(1)
    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.defaultReplyHeaders({})
    t.type(result, MockInterceptor)
  })

  t.test('should error if passed options invalid', t => {
    t.plan(1)

    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    t.throws(() => mockInterceptor.defaultReplyHeaders(), new InvalidArgumentError('headers must be defined'))
  })
})

test('MockInterceptor - defaultReplyTrailers', t => {
  t.plan(2)

  t.test('should return MockInterceptor', t => {
    t.plan(1)
    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.defaultReplyTrailers({})
    t.type(result, MockInterceptor)
  })

  t.test('should error if passed options invalid', t => {
    t.plan(1)

    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    t.throws(() => mockInterceptor.defaultReplyTrailers(), new InvalidArgumentError('trailers must be defined'))
  })
})

test('MockInterceptor - replyContentLength', t => {
  t.plan(1)

  t.test('should return MockInterceptor', t => {
    t.plan(1)
    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.defaultReplyTrailers({})
    t.type(result, MockInterceptor)
  })
})
