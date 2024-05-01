'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, describe } = require('node:test')
const { MockScope } = require('../lib/mock/mock-interceptor')
const { InvalidArgumentError } = require('../lib/core/errors')

describe('MockScope - delay', () => {
  test('should return MockScope', t => {
    t = tspl(t, { plan: 1 })
    const mockScope = new MockScope({
      path: '',
      method: ''
    }, [])
    const result = mockScope.delay(200)
    t.ok(result instanceof MockScope)
  })

  test('should error if passed options invalid', t => {
    t = tspl(t, { plan: 4 })

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

describe('MockScope - persist', () => {
  test('should return MockScope', t => {
    t = tspl(t, { plan: 1 })
    const mockScope = new MockScope({
      path: '',
      method: ''
    }, [])
    const result = mockScope.persist()
    t.ok(result instanceof MockScope)
  })
})

describe('MockScope - times', t => {
  test('should return MockScope', t => {
    t = tspl(t, { plan: 1 })
    const mockScope = new MockScope({
      path: '',
      method: ''
    }, [])
    const result = mockScope.times(200)
    t.ok(result instanceof MockScope)
  })

  test('should error if passed options invalid', t => {
    t = tspl(t, { plan: 4 })

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
