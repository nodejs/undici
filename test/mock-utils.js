'use strict'

const { test, describe } = require('node:test')
const { MockNotMatchedError } = require('../lib/mock/mock-errors')
const {
  deleteMockDispatch,
  getMockDispatch,
  getResponseData,
  getStatusText,
  getHeaderByName,
  buildHeadersFromArray,
  normalizeSearchParams
} = require('../lib/mock/mock-utils')

test('deleteMockDispatch - should do nothing if not able to find mock dispatch', (t) => {
  t.plan(1)

  const key = {
    url: 'url',
    path: 'path',
    method: 'method',
    body: 'body'
  }

  t.assert.doesNotThrow(() => deleteMockDispatch([], key))
})

describe('getMockDispatch', () => {
  test('it should find a mock dispatch', (t) => {
    t.plan(1)
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
    t.assert.deepStrictEqual(result, {
      path: 'path',
      method: 'method',
      consumed: false
    })
  })

  test('it should skip consumed dispatches', (t) => {
    t.plan(1)
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
    t.assert.deepStrictEqual(result, {
      path: 'path',
      method: 'method',
      consumed: false
    })
  })

  test('it should throw if dispatch not found', (t) => {
    t.plan(1)
    const dispatches = [
      {
        path: 'path',
        method: 'method',
        consumed: false
      }
    ]

    t.assert.throws(() => getMockDispatch(dispatches, {
      path: 'wrong',
      method: 'wrong'
    }), new MockNotMatchedError('Mock dispatch not matched for path \'wrong\''))
  })

  test('it should throw if no dispatch matches method', (t) => {
    t.plan(1)
    const dispatches = [
      {
        path: 'path',
        method: 'method',
        consumed: false
      }
    ]

    t.assert.throws(() => getMockDispatch(dispatches, {
      path: 'path',
      method: 'wrong'
    }), new MockNotMatchedError('Mock dispatch not matched for method \'wrong\' on path \'path\''))
  })

  test('it should throw if no dispatch matches body', (t) => {
    t.plan(1)
    const dispatches = [
      {
        path: 'path',
        method: 'method',
        body: 'body',
        consumed: false
      }
    ]

    t.assert.throws(() => getMockDispatch(dispatches, {
      path: 'path',
      method: 'method',
      body: 'wrong'
    }), new MockNotMatchedError('Mock dispatch not matched for body \'wrong\' on path \'path\''))
  })

  test('it should throw if no dispatch matches headers', (t) => {
    t.plan(1)
    const dispatches = [
      {
        path: 'path',
        method: 'method',
        body: 'body',
        headers: { key: 'value' },
        consumed: false
      }
    ]

    t.assert.throws(() => getMockDispatch(dispatches, {
      path: 'path',
      method: 'method',
      body: 'body',
      headers: { key: 'wrong' }
    }), new MockNotMatchedError('Mock dispatch not matched for headers \'{"key":"wrong"}\' on path \'path\''))
  })
})

describe('getResponseData', () => {
  test('it should stringify objects', (t) => {
    t.plan(1)
    const responseData = getResponseData({ str: 'string', num: 42 })
    t.assert.strictEqual(responseData, '{"str":"string","num":42}')
  })

  test('it should return strings untouched', (t) => {
    t.plan(1)
    const responseData = getResponseData('test')
    t.assert.strictEqual(responseData, 'test')
  })

  test('it should return buffers untouched', (t) => {
    t.plan(1)
    const responseData = getResponseData(Buffer.from('test'))
    t.assert.ok(Buffer.isBuffer(responseData))
  })

  test('it should return Uint8Array untouched', (t) => {
    t.plan(1)
    const responseData = getResponseData(new TextEncoder().encode('{"test":true}'))
    t.assert.ok(responseData instanceof Uint8Array)
  })

  test('it should return ArrayBuffers untouched', (t) => {
    t.plan(1)
    const responseData = getResponseData(new TextEncoder().encode('{"test":true}').buffer)
    t.assert.ok(responseData instanceof ArrayBuffer)
  })

  test('it should handle undefined', (t) => {
    t.plan(1)
    const responseData = getResponseData(undefined)
    t.assert.strictEqual(responseData, '')
  })
})

test('getStatusText', (t) => {
  t.plan(64)

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
    t.assert.ok(getStatusText(statusCode))
  }

  t.assert.strictEqual(getStatusText(420), 'unknown')
})

test('getHeaderByName', (t) => {
  t.plan(6)

  const headersRecord = {
    key: 'value'
  }

  t.assert.strictEqual(getHeaderByName(headersRecord, 'key'), 'value')
  t.assert.strictEqual(getHeaderByName(headersRecord, 'anotherKey'), undefined)

  const headersArray = ['key', 'value']

  t.assert.strictEqual(getHeaderByName(headersArray, 'key'), 'value')
  t.assert.strictEqual(getHeaderByName(headersArray, 'anotherKey'), undefined)

  const { Headers } = require('../index')

  const headers = new Headers([
    ['key', 'value']
  ])

  t.assert.strictEqual(getHeaderByName(headers, 'key'), 'value')
  t.assert.strictEqual(getHeaderByName(headers, 'anotherKey'), null)
})

describe('buildHeadersFromArray', () => {
  test('it should build headers from array', (t) => {
    t.plan(2)

    const headers = buildHeadersFromArray([
      'key', 'value'
    ])

    t.assert.deepStrictEqual(Object.keys(headers).length, 1)
    t.assert.strictEqual(headers.key, 'value')
  })
})

describe('normalizeQueryParams', () => {
  test('it should handle basic cases', (t) => {
    t.plan(4)

    t.assert.deepStrictEqual(normalizeSearchParams('').toString(), '')
    t.assert.deepStrictEqual(normalizeSearchParams('a').toString(), 'a=')
    t.assert.deepStrictEqual(normalizeSearchParams('b=2&c=3&a=1').toString(), 'b=2&c=3&a=1')
    t.assert.deepStrictEqual(normalizeSearchParams('lang=en_EN&id=123').toString(), 'lang=en_EN&id=123')
  })

  // https://github.com/nodejs/undici/issues/4146
  test('it should handle multiple values set using different syntaxes', (t) => {
    t.plan(3)

    t.assert.deepStrictEqual(normalizeSearchParams('a=1&a=2&a=3').toString(), 'a=1&a=2&a=3')
    t.assert.deepStrictEqual(normalizeSearchParams('a[]=1&a[]=2&a[]=3').toString(), 'a=1&a=2&a=3')
    t.assert.deepStrictEqual(normalizeSearchParams('a=1,2,3').toString(), 'a=1&a=2&a=3')
  })

  test('should handle edge case scenarios', (t) => {
    t.plan(4)

    t.assert.deepStrictEqual(normalizeSearchParams('a="b[]"').toString(), `a=${encodeURIComponent('"b[]"')}`)
    t.assert.deepStrictEqual(normalizeSearchParams('a="1,2,3"').toString(), `a=${encodeURIComponent('"1,2,3"')}`)
    const encodedSingleQuote = '%27'
    t.assert.deepStrictEqual(normalizeSearchParams("a='b[]'").toString(), `a=${encodedSingleQuote}${encodeURIComponent('b[]')}${encodedSingleQuote}`)
    t.assert.deepStrictEqual(normalizeSearchParams("a='1,2,3'").toString(), `a=${encodedSingleQuote}${encodeURIComponent('1,2,3')}${encodedSingleQuote}`)
  })
})
