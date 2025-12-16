'use strict'

const { test, describe } = require('node:test')
const { MockScope } = require('../lib/mock/mock-interceptor')
const { InvalidArgumentError } = require('../lib/core/errors')

describe('MockScope - delay', () => {
  test('should return MockScope', t => {
    t.plan(1)
    const mockScope = new MockScope({
      path: '',
      method: ''
    }, [])
    const result = mockScope.delay(200)
    t.assert.ok(result instanceof MockScope)
  })

  test('should error if passed options invalid', t => {
    t.plan(4)

    const mockScope = new MockScope({
      path: '',
      method: ''
    }, [])
    t.assert.throws(() => mockScope.delay(), new InvalidArgumentError('waitInMs must be a valid integer > 0'))
    t.assert.throws(() => mockScope.delay(200.1), new InvalidArgumentError('waitInMs must be a valid integer > 0'))
    t.assert.throws(() => mockScope.delay(0), new InvalidArgumentError('waitInMs must be a valid integer > 0'))
    t.assert.throws(() => mockScope.delay(-1), new InvalidArgumentError('waitInMs must be a valid integer > 0'))
  })
})

describe('MockScope - persist', () => {
  test('should return MockScope', t => {
    t.plan(1)
    const mockScope = new MockScope({
      path: '',
      method: ''
    }, [])
    const result = mockScope.persist()
    t.assert.ok(result instanceof MockScope)
  })
})

describe('MockScope - times', t => {
  test('should return MockScope', t => {
    t.plan(1)
    const mockScope = new MockScope({
      path: '',
      method: ''
    }, [])
    const result = mockScope.times(200)
    t.assert.ok(result instanceof MockScope)
  })

  test('should error if passed options invalid', t => {
    t.plan(4)

    const mockScope = new MockScope({
      path: '',
      method: ''
    }, [])
    t.assert.throws(() => mockScope.times(), new InvalidArgumentError('repeatTimes must be a valid integer > 0'))
    t.assert.throws(() => mockScope.times(200.1), new InvalidArgumentError('repeatTimes must be a valid integer > 0'))
    t.assert.throws(() => mockScope.times(0), new InvalidArgumentError('repeatTimes must be a valid integer > 0'))
    t.assert.throws(() => mockScope.times(-1), new InvalidArgumentError('repeatTimes must be a valid integer > 0'))
  })
})
