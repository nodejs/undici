'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, describe } = require('node:test')
const { MockCallHistoryLog } = require('../lib/mock/mock-call-history')
const { InvalidArgumentError } = require('../lib/core/errors')

describe('MockCallHistoryLog - constructor', () => {
  function assertConsistent (t, mockCallHistoryLog) {
    t.strictEqual(mockCallHistoryLog.body, null)
    t.strictEqual(mockCallHistoryLog.headers, undefined)
    t.deepStrictEqual(mockCallHistoryLog.searchParams, { query: 'value' })
    t.strictEqual(mockCallHistoryLog.method, 'PUT')
    t.strictEqual(mockCallHistoryLog.origin, 'https://localhost:4000')
    t.strictEqual(mockCallHistoryLog.path, '/endpoint')
    t.strictEqual(mockCallHistoryLog.hash, '#here')
    t.strictEqual(mockCallHistoryLog.protocol, 'https:')
    t.strictEqual(mockCallHistoryLog.host, 'localhost:4000')
    t.strictEqual(mockCallHistoryLog.port, '4000')
  }

  test('should populate class properties with query in path', t => {
    t = tspl(t, { plan: 10 })

    const mockCallHistoryLog = new MockCallHistoryLog({
      body: null,
      headers: undefined,
      method: 'PUT',
      origin: 'https://localhost:4000',
      path: '/endpoint?query=value#here'
    })

    assertConsistent(t, mockCallHistoryLog)
  })

  test('should populate class properties with query in argument', t => {
    t = tspl(t, { plan: 10 })

    const mockCallHistoryLog = new MockCallHistoryLog({
      body: null,
      headers: undefined,
      method: 'PUT',
      origin: 'https://localhost:4000',
      path: '/endpoint#here',
      query: { query: 'value' }
    })

    assertConsistent(t, mockCallHistoryLog)
  })

  test('should throw when url computing failed', t => {
    t = tspl(t, { plan: 1 })

    t.throws(() => new MockCallHistoryLog({}), new InvalidArgumentError('An error occurred when computing MockCallHistoryLog.url'))
  })
})

describe('MockCallHistoryLog - toMap', () => {
  test('should return a Map of eleven element', t => {
    t = tspl(t, { plan: 1 })

    const mockCallHistoryLog = new MockCallHistoryLog({
      body: '"{}"',
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
      origin: 'https://localhost:4000',
      path: '/endpoint?query=value#here'
    })

    t.strictEqual(mockCallHistoryLog.toMap().size, 11)
  })
})

describe('MockCallHistoryLog - toString', () => {
  test('should return a string with all property', t => {
    t = tspl(t, { plan: 1 })

    const mockCallHistoryLog = new MockCallHistoryLog({
      body: '"{ "data": "hello" }"',
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
      origin: 'https://localhost:4000',
      path: '/endpoint?query=value#here'
    })

    t.strictEqual(mockCallHistoryLog.toString(), 'protocol->https:|host->localhost:4000|port->4000|origin->https://localhost:4000|path->/endpoint|hash->#here|searchParams->{"query":"value"}|fullUrl->https://localhost:4000/endpoint?query=value#here|method->PUT|body->"{ "data": "hello" }"|headers->{"content-type":"application/json"}')
  })

  test('should return a string when headers is an Array of string Array', t => {
    t = tspl(t, { plan: 1 })

    const mockCallHistoryLog = new MockCallHistoryLog({
      body: '"{ "data": "hello" }"',
      headers: ['content-type', ['application/json', 'application/xml']],
      method: 'PUT',
      origin: 'https://localhost:4000',
      path: '/endpoint?query=value#here'
    })

    t.strictEqual(mockCallHistoryLog.toString(), 'protocol->https:|host->localhost:4000|port->4000|origin->https://localhost:4000|path->/endpoint|hash->#here|searchParams->{"query":"value"}|fullUrl->https://localhost:4000/endpoint?query=value#here|method->PUT|body->"{ "data": "hello" }"|headers->["content-type",["application/json","application/xml"]]')
  })
})
