'use strict'

const { test } = require('tap')
const { MockScope } = require('../lib/mock/mock-interceptor')
const { InvalidArgumentError } = require('../lib/core/errors')

test('MockScope - delay', t => {
  t.plan(2)

  t.test('should return MockScope', t => {
    t.plan(1)
    const mockScope = new MockScope({
      path: '',
      method: ''
    }, [])
    const result = mockScope.delay(200)
    t.ok(result instanceof MockScope)
  })

  t.test('should error if passed options invalid', t => {
    t.plan(4)

    const mockScope = new MockScope({
      path: '',
      method: ''
    }, [])
    t.throws(() => mockScope.delay(), new InvalidArgumentError('waitInMs must be a valid integer > 0'))
    t.throws(() => mockScope.delay(200.1), new InvalidArgumentError('waitInMs must be a valid integer > 0'))
    t.throws(() => mockScope.delay(0), new InvalidArgumentError('waitInMs must be a valid integer > 0'))
    t.throws(() => mockScope.delay(-1), new InvalidArgumentError('waitInMs must be a valid integer > 0'))
  })
})

test('MockScope - persist', t => {
  t.plan(1)

  t.test('should return MockScope', t => {
    t.plan(1)
    const mockScope = new MockScope({
      path: '',
      method: ''
    }, [])
    const result = mockScope.persist()
    t.ok(result instanceof MockScope)
  })
})

test('MockScope - times', t => {
  t.plan(2)

  t.test('should return MockScope', t => {
    t.plan(1)
    const mockScope = new MockScope({
      path: '',
      method: ''
    }, [])
    const result = mockScope.times(200)
    t.ok(result instanceof MockScope)
  })

  t.test('should error if passed options invalid', t => {
    t.plan(4)

    const mockScope = new MockScope({
      path: '',
      method: ''
    }, [])
    t.throws(() => mockScope.times(), new InvalidArgumentError('repeatTimes must be a valid integer > 0'))
    t.throws(() => mockScope.times(200.1), new InvalidArgumentError('repeatTimes must be a valid integer > 0'))
    t.throws(() => mockScope.times(0), new InvalidArgumentError('repeatTimes must be a valid integer > 0'))
    t.throws(() => mockScope.times(-1), new InvalidArgumentError('repeatTimes must be a valid integer > 0'))
  })
})
