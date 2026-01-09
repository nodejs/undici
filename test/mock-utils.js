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
  normalizeSearchParams,
  normalizeOrigin
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

describe('normalizeOrigin', () => {
  test('should normalize hostname to lowercase for string origins', (t) => {
    t.plan(4)

    t.assert.strictEqual(normalizeOrigin('http://Example.com'), 'http://example.com')
    t.assert.strictEqual(normalizeOrigin('http://EXAMPLE.COM'), 'http://example.com')
    t.assert.strictEqual(normalizeOrigin('https://Api.Example.com'), 'https://api.example.com')
    t.assert.strictEqual(normalizeOrigin('http://MyEndpoint'), 'http://myendpoint')
  })

  test('should normalize hostname to lowercase for URL objects', (t) => {
    t.plan(4)

    t.assert.strictEqual(normalizeOrigin(new URL('http://Example.com')), 'http://example.com')
    t.assert.strictEqual(normalizeOrigin(new URL('http://EXAMPLE.COM')), 'http://example.com')
    t.assert.strictEqual(normalizeOrigin(new URL('https://Api.Example.com')), 'https://api.example.com')
    t.assert.strictEqual(normalizeOrigin(new URL('http://MyEndpoint')), 'http://myendpoint')
  })

  test('should preserve port numbers', (t) => {
    t.plan(4)

    t.assert.strictEqual(normalizeOrigin('http://Example.com:8080'), 'http://example.com:8080')
    // Note: url.origin omits default ports (443 for HTTPS, 80 for HTTP)
    t.assert.strictEqual(normalizeOrigin('https://Api.Example.com:443'), 'https://api.example.com')
    t.assert.strictEqual(normalizeOrigin(new URL('http://Example.com:3000')), 'http://example.com:3000')
    t.assert.strictEqual(normalizeOrigin(new URL('https://Test.com:8443')), 'https://test.com:8443')
  })

  test('should handle default ports correctly', (t) => {
    t.plan(2)

    // Default ports should be omitted from origin
    t.assert.strictEqual(normalizeOrigin('http://Example.com:80'), 'http://example.com')
    t.assert.strictEqual(normalizeOrigin('https://Example.com:443'), 'https://example.com')
  })

  test('should remove trailing slash when ignoreTrailingSlash is true', (t) => {
    t.plan(4)

    t.assert.strictEqual(normalizeOrigin('http://example.com/'), 'http://example.com')
    t.assert.strictEqual(normalizeOrigin('https://example.com/'), 'https://example.com')
    t.assert.strictEqual(normalizeOrigin(new URL('http://example.com/')), 'http://example.com')
    t.assert.strictEqual(normalizeOrigin('http://example.com'), 'http://example.com')
  })

  test('should not remove trailing slash when ignoreTrailingSlash is false', (t) => {
    t.plan(2)

    t.assert.strictEqual(normalizeOrigin('http://example.com/'), 'http://example.com')
    t.assert.strictEqual(normalizeOrigin('http://example.com'), 'http://example.com')
  })

  test('should return RegExp matchers as-is', (t) => {
    t.plan(1)

    const regex = /http:\/\/example\.com/
    t.assert.strictEqual(normalizeOrigin(regex), regex)
  })

  test('should return function matchers as-is', (t) => {
    t.plan(1)

    const fn = (origin) => origin === 'http://example.com'
    t.assert.strictEqual(normalizeOrigin(fn), fn)
  })

  test('should return other non-string, non-URL types as-is', (t) => {
    t.plan(4)

    const obj = { origin: 'http://example.com' }
    const num = 123
    const bool = true
    const nullValue = null

    t.assert.strictEqual(normalizeOrigin(obj), obj)
    t.assert.strictEqual(normalizeOrigin(num), num)
    t.assert.strictEqual(normalizeOrigin(bool), bool)
    t.assert.strictEqual(normalizeOrigin(nullValue), nullValue)
  })

  test('should handle invalid URLs gracefully', (t) => {
    t.plan(2)

    // Invalid URL strings should be returned as-is
    t.assert.strictEqual(normalizeOrigin('not-a-url'), 'not-a-url')
    t.assert.strictEqual(normalizeOrigin('://invalid'), '://invalid')
  })

  test('should handle IPv4 addresses', (t) => {
    t.plan(2)

    t.assert.strictEqual(normalizeOrigin('http://192.168.1.1'), 'http://192.168.1.1')
    t.assert.strictEqual(normalizeOrigin('http://127.0.0.1:3000'), 'http://127.0.0.1:3000')
  })

  test('should handle IPv6 addresses', (t) => {
    t.plan(2)

    t.assert.strictEqual(normalizeOrigin('http://[::1]'), 'http://[::1]')
    t.assert.strictEqual(normalizeOrigin('http://[2001:db8::1]:8080'), 'http://[2001:db8::1]:8080')
  })

  test('should handle localhost with different cases', (t) => {
    t.plan(3)

    t.assert.strictEqual(normalizeOrigin('http://LocalHost'), 'http://localhost')
    t.assert.strictEqual(normalizeOrigin('http://LOCALHOST:3000'), 'http://localhost:3000')
    t.assert.strictEqual(normalizeOrigin(new URL('http://LocalHost')), 'http://localhost')
  })

  test('should handle subdomains with mixed case', (t) => {
    t.plan(3)

    t.assert.strictEqual(normalizeOrigin('http://Api.Example.Com'), 'http://api.example.com')
    t.assert.strictEqual(normalizeOrigin('https://WWW.Example.COM'), 'https://www.example.com')
    t.assert.strictEqual(normalizeOrigin(new URL('http://Sub.Domain.Example.Com')), 'http://sub.domain.example.com')
  })

  test('should handle paths in URL objects (should only normalize origin part)', (t) => {
    t.plan(2)

    // URL objects with paths should still only return the origin
    const url1 = new URL('http://Example.com/path/to/resource')
    t.assert.strictEqual(normalizeOrigin(url1), 'http://example.com')

    const url2 = new URL('https://Api.Example.com:8080/api/v1')
    t.assert.strictEqual(normalizeOrigin(url2), 'https://api.example.com:8080')
  })
})
