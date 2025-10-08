'use strict'

const { test, describe } = require('node:test')
const { MockCallHistory, MockCallHistoryLog } = require('../lib/mock/mock-call-history')
const { kMockCallHistoryAddLog } = require('../lib/mock/mock-symbols')
const { InvalidArgumentError } = require('../lib/core/errors')

describe('MockCallHistory - constructor', () => {
  test('should returns a MockCallHistory', t => {
    t.plan(1)

    const mockCallHistory = new MockCallHistory()

    t.assert.ok(mockCallHistory instanceof MockCallHistory)
  })
})

describe('MockCallHistory - add log', () => {
  test('should add a log', t => {
    t.plan(2)

    const mockCallHistoryHello = new MockCallHistory()

    t.assert.strictEqual(mockCallHistoryHello.calls().length, 0)

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'https://localhost:4000' })

    t.assert.strictEqual(mockCallHistoryHello.calls().length, 1)
  })
})

describe('MockCallHistory - calls', () => {
  test('should returns every logs', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'https://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'https://localhost:4000' })

    t.assert.strictEqual(mockCallHistoryHello.calls().length, 2)
  })

  test('should returns empty array when no logs', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    t.assert.ok(mockCallHistoryHello.calls() instanceof Array)
  })
})

describe('MockCallHistory - firstCall', () => {
  test('should returns the first log registered', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'http://localhost:4000' })

    t.assert.strictEqual(mockCallHistoryHello.firstCall()?.path, '/')
  })

  test('should returns undefined when no logs', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    t.assert.strictEqual(mockCallHistoryHello.firstCall(), undefined)
  })
})

describe('MockCallHistory - lastCall', () => {
  test('should returns the first log registered', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'http://localhost:4000' })

    t.assert.strictEqual(mockCallHistoryHello.lastCall()?.path, '/noop')
  })

  test('should returns undefined when no logs', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    t.assert.strictEqual(mockCallHistoryHello.lastCall(), undefined)
  })
})

describe('MockCallHistory - nthCall', () => {
  test('should returns the nth log registered', t => {
    t.plan(2)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'http://localhost:4000' })

    t.assert.strictEqual(mockCallHistoryHello.nthCall(1)?.path, '/')
    t.assert.strictEqual(mockCallHistoryHello.nthCall(2)?.path, '/noop')
  })

  test('should returns undefined when no logs', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    t.assert.strictEqual(mockCallHistoryHello.nthCall(3), undefined)
  })

  test('should throw if index is not a number', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    t.assert.throws(() => mockCallHistoryHello.nthCall('noop'), new InvalidArgumentError('nthCall must be called with a number'))
  })

  test('should throw if index is not an integer', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    t.assert.throws(() => mockCallHistoryHello.nthCall(1.3), new InvalidArgumentError('nthCall must be called with an integer'))
  })

  test('should throw if index is equal to zero', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    t.assert.throws(() => mockCallHistoryHello.nthCall(0), new InvalidArgumentError('nthCall must be called with a positive value. use firstCall or lastCall instead'))
  })

  test('should throw if index is negative', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    t.assert.throws(() => mockCallHistoryHello.nthCall(-1), new InvalidArgumentError('nthCall must be called with a positive value. use firstCall or lastCall instead'))
  })
})

describe('MockCallHistory - iterator', () => {
  test('should permit to iterate over logs with for..of', t => {
    t.plan(4)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'http://localhost:4000' })

    for (const log of mockCallHistoryHello) {
      t.assert.ok(log instanceof MockCallHistoryLog)
      t.assert.ok(typeof log.path === 'string')
    }
  })

  test('should permit to iterate over logs with spread operator', t => {
    t.plan(2)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'http://localhost:4000' })

    const logs = [...mockCallHistoryHello]

    t.assert.ok(logs.every((log) => log instanceof MockCallHistoryLog))
    t.assert.strictEqual(logs.length, 2)
  })
})

describe('MockCallHistory - filterCalls without options', () => {
  test('should filter logs with a function', t => {
    t.plan(2)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'http://localhost:4000' })

    const filtered = mockCallHistoryHello.filterCalls((log) => log.path === '/noop')

    t.assert.strictEqual(filtered?.[0]?.path, '/noop')
    t.assert.strictEqual(filtered.length, 1)
  })

  test('should filter logs with a regexp', t => {
    t.plan(2)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'https://localhost:4000' })

    const filtered = mockCallHistoryHello.filterCalls(/https:\/\//)

    t.assert.strictEqual(filtered?.[0]?.path, '/noop')
    t.assert.strictEqual(filtered.length, 1)
  })

  test('should filter logs with an object', t => {
    t.plan(2)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/yes', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'https://localhost:4000' })

    const filtered = mockCallHistoryHello.filterCalls({ protocol: 'https:' })

    t.assert.strictEqual(filtered?.[0]?.path, '/noop')
    t.assert.strictEqual(filtered.length, 1)
  })

  test('should returns every logs with an empty object', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/yes', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'https://localhost:4000' })

    const filtered = mockCallHistoryHello.filterCalls({})

    t.assert.strictEqual(filtered.length, 3)
  })

  test('should filter logs with an object with host property', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/yes', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'https://127.0.0.1:4000' })

    const filtered = mockCallHistoryHello.filterCalls({ host: /localhost/ })

    t.assert.strictEqual(filtered.length, 2)
  })

  test('should filter logs with an object with port property', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:1000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/yes', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'https://127.0.0.1:4000' })

    const filtered = mockCallHistoryHello.filterCalls({ port: '1000' })

    t.assert.strictEqual(filtered.length, 1)
  })

  test('should filter logs with an object with hash property', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/#hello', origin: 'http://localhost:1000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/yes', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'https://127.0.0.1:4000' })

    const filtered = mockCallHistoryHello.filterCalls({ hash: '#hello' })

    t.assert.strictEqual(filtered.length, 1)
  })

  test('should filter logs with an object with fullUrl property', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '#hello', origin: 'http://localhost:1000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/yes', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'https://127.0.0.1:4000' })

    const filtered = mockCallHistoryHello.filterCalls({ fullUrl: 'http://localhost:1000/#hello' })

    t.assert.strictEqual(filtered.length, 1)
  })

  test('should filter logs with an object with method property', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:1000', method: 'POST' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/yes', origin: 'http://localhost:4000', method: 'GET' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'https://127.0.0.1:4000', method: 'PUT' })

    const filtered = mockCallHistoryHello.filterCalls({ method: /(PUT|GET)/ })

    t.assert.strictEqual(filtered.length, 2)
  })

  test('should use "OR" operator', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/yes', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'https://localhost:4000' })

    const filtered = mockCallHistoryHello.filterCalls({ protocol: 'https:', path: /^\/$/ })

    t.assert.strictEqual(filtered.length, 2)
  })

  test('should returns no duplicated logs', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/yes', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'https://localhost:4000' })

    const filtered = mockCallHistoryHello.filterCalls({ protocol: 'https:', origin: /localhost/ })

    t.assert.strictEqual(filtered.length, 3)
  })

  test('should throw if criteria is typeof number', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })

    t.assert.throws(() => mockCallHistoryHello.filterCalls({ path: 3 }), new InvalidArgumentError('path parameter should be one of string, regexp, undefined or null'))
  })

  test('should throw if criteria is not a function, regexp, nor object', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })

    t.assert.throws(() => mockCallHistoryHello.filterCalls(3), new InvalidArgumentError('criteria parameter should be one of function, regexp, or object'))
  })
})

describe('MockCallHistory - filterCalls with options', () => {
  test('should throw if options.operator is not a valid string', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })

    t.assert.throws(() => mockCallHistoryHello.filterCalls({ path: '/' }, { operator: 'wrong' }), new InvalidArgumentError('options.operator must to be a case insensitive string equal to \'OR\' or \'AND\''))
  })

  test('should not throw if options.operator is "or"', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })

    t.assert.doesNotThrow(() => mockCallHistoryHello.filterCalls({ path: '/' }, { operator: 'or' }))
  })

  test('should not throw if options.operator is "and"', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })

    t.assert.doesNotThrow(() => mockCallHistoryHello.filterCalls({ path: '/' }, { operator: 'and' }))
  })

  test('should use "OR" operator if options is an empty object', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/foo', origin: 'http://localhost:4000' })

    const filtered = mockCallHistoryHello.filterCalls({ path: '/' }, {})

    t.assert.strictEqual(filtered.length, 1)
  })

  test('should use "AND" operator correctly', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:5000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/foo', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/foo', origin: 'http://localhost:5000' })

    const filtered = mockCallHistoryHello.filterCalls({ path: '/', port: '4000' }, { operator: 'AND' })

    t.assert.strictEqual(filtered.length, 2)
  })

  test('should use "AND" operator with a lot of filters', t => {
    t.plan(1)

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/#hello', origin: 'http://localhost:1000', method: 'GET' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/#hello', origin: 'http://localhost:1000', method: 'GET' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/#hello', origin: 'http://localhost:1000', method: 'DELETE' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/#hello', origin: 'http://localhost:1000', method: 'POST' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/#hello', origin: 'http://localhost:1000', method: 'PUT' })

    const filtered = mockCallHistoryHello.filterCalls({ path: '/', port: '1000', host: /localhost/, method: /(POST|PUT)/ }, { operator: 'AND' })

    t.assert.strictEqual(filtered.length, 2)
  })
})
