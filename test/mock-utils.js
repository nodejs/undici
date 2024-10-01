'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, describe } = require('node:test')
const { MockNotMatchedError } = require('../lib/mock/mock-errors')
const {
  deleteMockDispatch,
  getMockDispatch,
  getResponseData,
  getStatusText,
  getHeaderByName,
  buildHeadersFromArray
} = require('../lib/mock/mock-utils')

test('deleteMockDispatch - should do nothing if not able to find mock dispatch', (t) => {
  t = tspl(t, { plan: 1 })

  const key = {
    url: 'url',
    path: 'path',
    method: 'method',
    body: 'body'
  }

  t.doesNotThrow(() => deleteMockDispatch([], key))
})

describe('getMockDispatch', () => {
  test('it should find a mock dispatch', (t) => {
    t = tspl(t, { plan: 1 })
    const dispatches = [
      {
        path: 'path',
        method: 'method',
        consumed: false
      }
    ]

    const result = getMockDispatch(dispatches, {
      path: 'path',
      method: 'method'
    })
    t.deepStrictEqual(result, {
      path: 'path',
      method: 'method',
      consumed: false
    })
  })

  test('it should skip consumed dispatches', (t) => {
    t = tspl(t, { plan: 1 })
    const dispatches = [
      {
        path: 'path',
        method: 'method',
        consumed: true
      },
      {
        path: 'path',
        method: 'method',
        consumed: false
      }
    ]

    const result = getMockDispatch(dispatches, {
      path: 'path',
      method: 'method'
    })
    t.deepStrictEqual(result, {
      path: 'path',
      method: 'method',
      consumed: false
    })
  })

  test('it should throw if dispatch not found', (t) => {
    t = tspl(t, { plan: 1 })
    const dispatches = [
      {
        path: 'path',
        method: 'method',
        consumed: false
      }
    ]

    t.throws(() => getMockDispatch(dispatches, {
      path: 'wrong',
      method: 'wrong'
    }), new MockNotMatchedError('Mock dispatch not matched for path \'wrong\''))
  })

  test('it should throw if no dispatch matches method', (t) => {
    t = tspl(t, { plan: 1 })
    const dispatches = [
      {
        path: 'path',
        method: 'method',
        consumed: false
      }
    ]

    t.throws(() => getMockDispatch(dispatches, {
      path: 'path',
      method: 'wrong'
    }), new MockNotMatchedError('Mock dispatch not matched for method \'wrong\' on path \'path\''))
  })

  test('it should throw if no dispatch matches body', (t) => {
    t = tspl(t, { plan: 1 })
    const dispatches = [
      {
        path: 'path',
        method: 'method',
        body: 'body',
        consumed: false
      }
    ]

    t.throws(() => getMockDispatch(dispatches, {
      path: 'path',
      method: 'method',
      body: 'wrong'
    }), new MockNotMatchedError('Mock dispatch not matched for body \'wrong\' on path \'path\''))
  })

  test('it should throw if no dispatch matches headers', (t) => {
    t = tspl(t, { plan: 1 })
    const dispatches = [
      {
        path: 'path',
        method: 'method',
        body: 'body',
        headers: { key: 'value' },
        consumed: false
      }
    ]

    t.throws(() => getMockDispatch(dispatches, {
      path: 'path',
      method: 'method',
      body: 'body',
      headers: { key: 'wrong' }
    }), new MockNotMatchedError('Mock dispatch not matched for headers \'{"key":"wrong"}\' on path \'path\''))
  })
})

describe('getResponseData', () => {
  test('it should stringify objects', (t) => {
    t = tspl(t, { plan: 1 })
    const responseData = getResponseData({ str: 'string', num: 42 })
    t.strictEqual(responseData, '{"str":"string","num":42}')
  })

  test('it should return strings untouched', (t) => {
    t = tspl(t, { plan: 1 })
    const responseData = getResponseData('test')
    t.strictEqual(responseData, 'test')
  })

  test('it should return buffers untouched', (t) => {
    t = tspl(t, { plan: 1 })
    const responseData = getResponseData(Buffer.from('test'))
    t.ok(Buffer.isBuffer(responseData))
  })

  test('it should return Uint8Array untouched', (t) => {
    t = tspl(t, { plan: 1 })
    const responseData = getResponseData(new TextEncoder().encode('{"test":true}'))
    t.ok(responseData instanceof Uint8Array)
  })

  test('it should return ArrayBuffers untouched', (t) => {
    t = tspl(t, { plan: 1 })
    const responseData = getResponseData(new TextEncoder().encode('{"test":true}').buffer)
    t.ok(responseData instanceof ArrayBuffer)
  })
})

test('getStatusText', (t) => {
  t = tspl(t, { plan: 64 })

  for (const statusCode of [
    100, 101, 102, 103, 200, 201, 202, 203,
    204, 205, 206, 207, 208, 226, 300, 301,
    302, 303, 304, 305, 306, 307, 308, 400,
    401, 402, 403, 404, 405, 406, 407, 408,
    409, 410, 411, 412, 413, 414, 415, 416,
    417, 418, 421, 422, 423, 424, 425, 426,
    428, 429, 431, 451, 500, 501, 502, 503,
    504, 505, 506, 507, 508, 510, 511
  ]) {
    t.ok(getStatusText(statusCode))
  }

  t.strictEqual(getStatusText(420), 'unknown')

  t.end()
})

test('getHeaderByName', (t) => {
  t = tspl(t, { plan: 6 })

  const headersRecord = {
    key: 'value'
  }

  t.strictEqual(getHeaderByName(headersRecord, 'key'), 'value')
  t.strictEqual(getHeaderByName(headersRecord, 'anotherKey'), undefined)

  const headersArray = ['key', 'value']

  t.strictEqual(getHeaderByName(headersArray, 'key'), 'value')
  t.strictEqual(getHeaderByName(headersArray, 'anotherKey'), undefined)

  const { Headers } = require('../index')

  const headers = new Headers([
    ['key', 'value']
  ])

  t.strictEqual(getHeaderByName(headers, 'key'), 'value')
  t.strictEqual(getHeaderByName(headers, 'anotherKey'), null)

  t.end()
})

describe('buildHeadersFromArray', () => {
  test('it should build headers from array', (t) => {
    t = tspl(t, { plan: 2 })

    const headers = buildHeadersFromArray([
      'key', 'value'
    ])

    t.deepStrictEqual(Object.keys(headers).length, 1)
    t.strictEqual(headers.key, 'value')
  })
})
