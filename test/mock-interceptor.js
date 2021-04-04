'use strict'

const { test } = require('tap')
const { MockInterceptor, MockScope } = require('../lib/mock/mock-interceptor')
const { InvalidArgumentError } = require('../lib/core/errors')

test('MockInterceptor - reply', t => {
  t.plan(2)

  t.test('should return MockScope', t => {
    t.plan(1)
    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.reply(200, 'hello')
    t.ok(result instanceof MockScope)
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

test('MockInterceptor - replyWithError', t => {
  t.plan(2)

  t.test('should return MockScope', t => {
    t.plan(1)
    const mockInterceptor = new MockInterceptor({
      path: '',
      method: ''
    }, [])
    const result = mockInterceptor.replyWithError(new Error('kaboom'))
    t.ok(result instanceof MockScope)
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
    t.ok(result instanceof MockInterceptor)
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
    t.ok(result instanceof MockInterceptor)
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
    t.ok(result instanceof MockInterceptor)
  })
})
