'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, describe, after } = require('node:test')
const { MockCallHistory } = require('../lib/mock/mock-call-history')
const { kMockCallHistoryDeleteAll, kMockCallHistoryCreate, kMockCallHistoryAddLog, kMockCallHistoryClearAll, kMockCallHistoryAllMockCallHistoryInstances } = require('../lib/mock/mock-symbols')
const { InvalidArgumentError } = require('../lib/core/errors')

describe('MockCallHistory - constructor', () => {
  test('should returns a MockCallHistory', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistory = new MockCallHistory('hello')

    t.ok(mockCallHistory instanceof MockCallHistory)
  })

  test('should populate static class property', t => {
    t = tspl(t, { plan: 3 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    t.strictEqual(MockCallHistory[kMockCallHistoryAllMockCallHistoryInstances].size, 0)

    const mockCallHistory = new MockCallHistory('hello')

    t.strictEqual(MockCallHistory[kMockCallHistoryAllMockCallHistoryInstances].size, 1)
    t.strictEqual(MockCallHistory[kMockCallHistoryAllMockCallHistoryInstances].get('hello'), mockCallHistory)
  })
})

describe('MockCallHistory - Create', () => {
  test('should returns a MockCallHistory if named history is not present', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistory = MockCallHistory[kMockCallHistoryCreate]('hello')

    t.ok(mockCallHistory instanceof MockCallHistory)
  })

  test('should populate static class property', t => {
    t = tspl(t, { plan: 3 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    t.strictEqual(MockCallHistory[kMockCallHistoryAllMockCallHistoryInstances].size, 0)

    const mockCallHistory = new MockCallHistory('hello')

    t.strictEqual(MockCallHistory[kMockCallHistoryAllMockCallHistoryInstances].size, 1)
    t.strictEqual(MockCallHistory[kMockCallHistoryAllMockCallHistoryInstances].get('hello'), mockCallHistory)
  })
})

describe('MockCallHistory - add log', () => {
  test('should add a log', t => {
    t = tspl(t, { plan: 2 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    t.strictEqual(mockCallHistoryHello.calls().length, 0)

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'https://localhost:4000' })

    t.strictEqual(mockCallHistoryHello.calls().length, 1)
  })
})

describe('MockCallHistory - ClearAll', () => {
  test('should clear all call history', t => {
    t = tspl(t, { plan: 6 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')
    const mockCallHistoryWorld = new MockCallHistory('world')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'https://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'https://localhost:4000' })
    mockCallHistoryWorld[kMockCallHistoryAddLog]({ path: '/', origin: 'https://localhost:4000' })

    t.strictEqual(MockCallHistory[kMockCallHistoryAllMockCallHistoryInstances].size, 2)
    t.strictEqual(mockCallHistoryWorld.calls().length, 1)
    t.strictEqual(mockCallHistoryHello.calls().length, 2)

    MockCallHistory[kMockCallHistoryClearAll]()

    t.strictEqual(MockCallHistory[kMockCallHistoryAllMockCallHistoryInstances].size, 2)
    t.strictEqual(mockCallHistoryWorld.calls().length, 0)
    t.strictEqual(mockCallHistoryHello.calls().length, 0)
  })
})

describe('MockCallHistory - calls', () => {
  test('should returns every logs', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'https://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'https://localhost:4000' })

    t.strictEqual(mockCallHistoryHello.calls().length, 2)
  })

  test('should returns empty array when no logs', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    t.ok(mockCallHistoryHello.calls() instanceof Array)
  })
})

describe('MockCallHistory - firstCall', () => {
  test('should returns the first log registered', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'http://localhost:4000' })

    t.strictEqual(mockCallHistoryHello.firstCall()?.path, '/')
  })

  test('should returns undefined when no logs', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    t.strictEqual(mockCallHistoryHello.firstCall(), undefined)
  })
})

describe('MockCallHistory - lastCall', () => {
  test('should returns the first log registered', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'http://localhost:4000' })

    t.strictEqual(mockCallHistoryHello.lastCall()?.path, '/noop')
  })

  test('should returns undefined when no logs', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    t.strictEqual(mockCallHistoryHello.lastCall(), undefined)
  })
})

describe('MockCallHistory - nthCall', () => {
  test('should returns the nth log registered', t => {
    t = tspl(t, { plan: 2 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'http://localhost:4000' })

    t.strictEqual(mockCallHistoryHello.nthCall(1)?.path, '/')
    t.strictEqual(mockCallHistoryHello.nthCall(2)?.path, '/noop')
  })

  test('should returns undefined when no logs', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    t.strictEqual(mockCallHistoryHello.nthCall(3), undefined)
  })

  test('should throw if index is not a number', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    t.throws(() => mockCallHistoryHello.nthCall('noop'), new InvalidArgumentError('nthCall must be called with a number'))
  })

  test('should throw if index is not an integer', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    t.throws(() => mockCallHistoryHello.nthCall(1.3), new InvalidArgumentError('nthCall must be called with an integer'))
  })

  test('should throw if index is equal to zero', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    t.throws(() => mockCallHistoryHello.nthCall(0), new InvalidArgumentError('nthCall must be called with a positive value. use firstCall or lastCall instead'))
  })

  test('should throw if index is negative', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    t.throws(() => mockCallHistoryHello.nthCall(-1), new InvalidArgumentError('nthCall must be called with a positive value. use firstCall or lastCall instead'))
  })
})

describe('MockCallHistory - filterCalls', () => {
  test('should filter logs with a function', t => {
    t = tspl(t, { plan: 2 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'http://localhost:4000' })

    const filtered = mockCallHistoryHello.filterCalls((log) => log.path === '/noop')

    t.strictEqual(filtered?.[0]?.path, '/noop')
    t.strictEqual(filtered.length, 1)
  })

  test('should filter logs with a regexp', t => {
    t = tspl(t, { plan: 2 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'https://localhost:4000' })

    const filtered = mockCallHistoryHello.filterCalls(/https:\/\//)

    t.strictEqual(filtered?.[0]?.path, '/noop')
    t.strictEqual(filtered.length, 1)
  })

  test('should filter logs with an object', t => {
    t = tspl(t, { plan: 2 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/yes', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'https://localhost:4000' })

    const filtered = mockCallHistoryHello.filterCalls({ protocol: 'https:' })

    t.strictEqual(filtered?.[0]?.path, '/noop')
    t.strictEqual(filtered.length, 1)
  })

  test('should returns every logs with an empty object', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/yes', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'https://localhost:4000' })

    const filtered = mockCallHistoryHello.filterCalls({})

    t.strictEqual(filtered.length, 3)
  })

  test('should filter logs with an object with host property', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/yes', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'https://127.0.0.1:4000' })

    const filtered = mockCallHistoryHello.filterCalls({ host: /localhost/ })

    t.strictEqual(filtered.length, 2)
  })

  test('should filter logs with an object with port property', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:1000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/yes', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'https://127.0.0.1:4000' })

    const filtered = mockCallHistoryHello.filterCalls({ port: '1000' })

    t.strictEqual(filtered.length, 1)
  })

  test('should filter logs with an object with hash property', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/#hello', origin: 'http://localhost:1000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/yes', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'https://127.0.0.1:4000' })

    const filtered = mockCallHistoryHello.filterCalls({ hash: '#hello' })

    t.strictEqual(filtered.length, 1)
  })

  test('should filter logs with an object with fullUrl property', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '#hello', origin: 'http://localhost:1000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/yes', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'https://127.0.0.1:4000' })

    const filtered = mockCallHistoryHello.filterCalls({ fullUrl: 'http://localhost:1000/#hello' })

    t.strictEqual(filtered.length, 1)
  })

  test('should filter logs with an object with method property', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:1000', method: 'POST' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/yes', origin: 'http://localhost:4000', method: 'GET' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'https://127.0.0.1:4000', method: 'PUT' })

    const filtered = mockCallHistoryHello.filterCalls({ method: /(PUT|GET)/ })

    t.strictEqual(filtered.length, 2)
  })

  test('should filter multiple time logs with an object', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/yes', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'https://localhost:4000' })

    const filtered = mockCallHistoryHello.filterCalls({ protocol: 'https:', path: /^\/$/ })

    t.strictEqual(filtered.length, 2)
  })

  test('should returns no duplicated logs', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/yes', origin: 'http://localhost:4000' })
    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/noop', origin: 'https://localhost:4000' })

    const filtered = mockCallHistoryHello.filterCalls({ protocol: 'https:', origin: /localhost/ })

    t.strictEqual(filtered.length, 3)
  })

  test('should throw if criteria is typeof number', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })

    t.throws(() => mockCallHistoryHello.filterCalls({ path: 3 }), new InvalidArgumentError('path parameter should be one of string, regexp, undefined or null'))
  })

  test('should throw if criteria is not a function, regexp, nor object', t => {
    t = tspl(t, { plan: 1 })
    after(MockCallHistory[kMockCallHistoryDeleteAll])

    const mockCallHistoryHello = new MockCallHistory('hello')

    mockCallHistoryHello[kMockCallHistoryAddLog]({ path: '/', origin: 'http://localhost:4000' })

    t.throws(() => mockCallHistoryHello.filterCalls(3), new InvalidArgumentError('criteria parameter should be one of string, function, regexp, or object'))
  })
})
