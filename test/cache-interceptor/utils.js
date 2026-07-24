'use strict'

const { describe, test } = require('node:test')
const { deepStrictEqual, equal, strictEqual } = require('node:assert')
const { parseCacheControlHeader, parseVaryHeader, isEtagUsable } = require('../../lib/util/cache')

describe('parseCacheControlHeader', () => {
  test('all directives are parsed properly when in their correct format', () => {
    const directives = parseCacheControlHeader(
      'max-stale=1, min-fresh=1, max-age=1, s-maxage=1, stale-while-revalidate=1, stale-if-error=1, public, private, no-store, no-cache, must-revalidate, proxy-revalidate, immutable, no-transform, must-understand, only-if-cached'
    )
    deepStrictEqual(directives, {
      'max-stale': 1,
      'min-fresh': 1,
      'max-age': 1,
      's-maxage': 1,
      'stale-while-revalidate': 1,
      'stale-if-error': 1,
      public: true,
      private: true,
      'no-store': true,
      'no-cache': true,
      'must-revalidate': true,
      'proxy-revalidate': true,
      immutable: true,
      'no-transform': true,
      'must-understand': true,
      'only-if-cached': true
    })
  })

  test('handles weird spacings', () => {
    const directives = parseCacheControlHeader(
      'max-stale=1, min-fresh=1,     max-age=1,s-maxage=1,  stale-while-revalidate=1,stale-if-error=1,public,private'
    )
    deepStrictEqual(directives, {
      'max-stale': 1,
      'min-fresh': 1,
      'max-age': 1,
      's-maxage': 1,
      'stale-while-revalidate': 1,
      'stale-if-error': 1,
      public: true,
      private: true
    })
  })

  test('unknown directives are ignored', () => {
    const directives = parseCacheControlHeader('max-age=123, something-else=456')
    deepStrictEqual(directives, { 'max-age': 123 })
  })

  test('quoted extension values do not inject directives', () => {
    let directives = parseCacheControlHeader('extension="x, public, s-maxage=60, y", max-age=0')
    deepStrictEqual(directives, { 'max-age': 0 })

    directives = parseCacheControlHeader('extension="x, no-store, y", public, max-age=60')
    deepStrictEqual(directives, { public: true, 'max-age': 60 })

    directives = parseCacheControlHeader('extension="x, public, s-maxage=60, max-age=60')
    deepStrictEqual(directives, {})

    directives = parseCacheControlHeader('extension="x, no-store')
    deepStrictEqual(directives, { 'no-store': true })

    directives = parseCacheControlHeader('extension="x, private, no-cache')
    deepStrictEqual(directives, { private: true, 'no-cache': true })

    directives = parseCacheControlHeader(['extension="x', 'public, s-maxage=60, max-age=60'])
    deepStrictEqual(directives, {})

    directives = parseCacheControlHeader(['extension="x', 'private, no-cache, no-store'])
    deepStrictEqual(directives, { private: true, 'no-cache': true, 'no-store': true })
  })

  test('directives with incorrect types are ignored', () => {
    let directives = parseCacheControlHeader('max-age=true, only-if-cached=123')
    deepStrictEqual(directives, {})

    directives = parseCacheControlHeader('public =, must-revalidate=, immutable=, s-maxage=60x, max-age= 60')
    deepStrictEqual(directives, {})

    directives = parseCacheControlHeader('public\u00a0, must-revalidate\u00a0, max-age\u00a0=60')
    deepStrictEqual(directives, {})

    directives = parseCacheControlHeader('no-store=false, public, max-age=60')
    deepStrictEqual(directives, {
      'no-store': true,
      public: true,
      'max-age': 60
    })

    directives = parseCacheControlHeader('s-maxage=bad, s-maxage=60, max-age=60, max-age=bad')
    deepStrictEqual(directives, {})

    directives = parseCacheControlHeader('s-maxage =60, s-maxage=60')
    deepStrictEqual(directives, {})

    directives = parseCacheControlHeader('public=bad, public, must-revalidate, must-revalidate=bad')
    deepStrictEqual(directives, {})
  })

  test('malformed restrictive directive names are conservative', () => {
    let directives = parseCacheControlHeader('no-store\u00a0, public, max-age=60')
    deepStrictEqual(directives, {
      'no-store': true,
      public: true,
      'max-age': 60
    })

    directives = parseCacheControlHeader('no\u00a0-store, public, max-age=60')
    deepStrictEqual(directives, {
      'no-store': true,
      public: true,
      'max-age': 60
    })

    directives = parseCacheControlHeader('private\u00a0, no-cache\u00a0, public, max-age=60')
    deepStrictEqual(directives, {
      private: true,
      'no-cache': true,
      public: true,
      'max-age': 60
    })

    directives = parseCacheControlHeader('priv\u00a0ate, no\u00a0-cache, public, max-age=60')
    deepStrictEqual(directives, {
      private: true,
      'no-cache': true,
      public: true,
      'max-age': 60
    })

    directives = parseCacheControlHeader('no-storex, no\u00a0-storex, privatex, priv\u00a0atex, no-cachex, no\u00a0-cachex')
    deepStrictEqual(directives, {})
  })

  test('duplicate numeric directives use the most restrictive value', () => {
    let directives = parseCacheControlHeader('max-age=1, max-age=2')
    deepStrictEqual(directives, { 'max-age': 1 })

    directives = parseCacheControlHeader('s-maxage=60, s-maxage=0')
    deepStrictEqual(directives, { 's-maxage': 0 })

    directives = parseCacheControlHeader('min-fresh=1, min-fresh=2')
    deepStrictEqual(directives, { 'min-fresh': 2 })
  })

  test('oversized numeric directives are capped', () => {
    const huge = '9'.repeat(400)

    let directives = parseCacheControlHeader(`max-age=${huge}`)
    deepStrictEqual(directives, { 'max-age': 2147483647 })

    directives = parseCacheControlHeader(`max-age=${huge}, max-age=60`)
    deepStrictEqual(directives, { 'max-age': 60 })

    directives = parseCacheControlHeader(`min-fresh=${huge}, min-fresh=60`)
    deepStrictEqual(directives, { 'min-fresh': 2147483647 })
  })

  test('case insensitive', () => {
    const directives = parseCacheControlHeader('Max-Age=123')
    deepStrictEqual(directives, { 'max-age': 123 })
  })

  test('no-cache with headers', () => {
    let directives = parseCacheControlHeader('max-age=10, no-cache=some-header, only-if-cached')
    deepStrictEqual(directives, {
      'max-age': 10,
      'no-cache': [
        'some-header'
      ],
      'only-if-cached': true
    })

    directives = parseCacheControlHeader('max-age=10, no-cache="some-header", only-if-cached')
    deepStrictEqual(directives, {
      'max-age': 10,
      'no-cache': [
        'some-header'
      ],
      'only-if-cached': true
    })

    directives = parseCacheControlHeader('max-age=10, no-cache="some-header, another-one", only-if-cached')
    deepStrictEqual(directives, {
      'max-age': 10,
      'no-cache': [
        'some-header',
        'another-one'
      ],
      'only-if-cached': true
    })
  })

  test('trims qualified no-cache and private field names', () => {
    let directives = parseCacheControlHeader('private=" authorization"')
    deepStrictEqual(directives, {
      private: [
        'authorization'
      ]
    })

    directives = parseCacheControlHeader('no-cache="\tauthorization"')
    deepStrictEqual(directives, {
      'no-cache': [
        'authorization'
      ]
    })

    directives = parseCacheControlHeader('no-cache=authorization\t')
    deepStrictEqual(directives, {
      'no-cache': [
        'authorization'
      ]
    })

    directives = parseCacheControlHeader('private=" authorization, x-user\t"')
    deepStrictEqual(directives, {
      private: [
        'authorization',
        'x-user'
      ]
    })

    directives = parseCacheControlHeader('no-cache ="set-cookie"')
    deepStrictEqual(directives, {
      'no-cache': [
        'set-cookie'
      ]
    })

    directives = parseCacheControlHeader('no-cache= "set-cookie"')
    deepStrictEqual(directives, {
      'no-cache': [
        'set-cookie'
      ]
    })

    directives = parseCacheControlHeader('private = "authorization, set-cookie"')
    deepStrictEqual(directives, {
      private: [
        'authorization',
        'set-cookie'
      ]
    })

    directives = parseCacheControlHeader('no-cache\t=\t"set-cookie"')
    deepStrictEqual(directives, {
      'no-cache': [
        'set-cookie'
      ]
    })

    directives = parseCacheControlHeader('private \t= \t"authorization"')
    deepStrictEqual(directives, {
      private: [
        'authorization'
      ]
    })

    directives = parseCacheControlHeader('no-cache= "\tset-cookie, authorization\t"\t')
    deepStrictEqual(directives, {
      'no-cache': [
        'set-cookie',
        'authorization'
      ]
    })

    directives = parseCacheControlHeader('no-cache="set-cookie" , max-age=60')
    deepStrictEqual(directives, {
      'no-cache': [
        'set-cookie'
      ],
      'max-age': 60
    })

    directives = parseCacheControlHeader('no-cache="authorization" garbage')
    deepStrictEqual(directives, {
      'no-cache': [
        'authorization'
      ]
    })
  })

  test('normalizes empty qualified no-cache and private as unqualified', () => {
    for (const directive of ['private', 'no-cache']) {
      for (const value of ['""', '","', '"   "']) {
        const directives = parseCacheControlHeader(`${directive}=${value}`)
        deepStrictEqual(directives, {
          [directive]: true
        })
      }
    }
  })

  test('keeps unqualified no-cache and private when repeated with qualified field names', () => {
    let directives = parseCacheControlHeader('private, private="some-header"')
    deepStrictEqual(directives, {
      private: true
    })

    directives = parseCacheControlHeader('no-cache, no-cache="some-header"')
    deepStrictEqual(directives, {
      'no-cache': true
    })
  })

  test('private with headers', () => {
    let directives = parseCacheControlHeader('max-age=10, private=some-header, only-if-cached')
    deepStrictEqual(directives, {
      'max-age': 10,
      private: [
        'some-header'
      ],
      'only-if-cached': true
    })

    directives = parseCacheControlHeader('max-age=10, private="some-header", only-if-cached')
    deepStrictEqual(directives, {
      'max-age': 10,
      private: [
        'some-header'
      ],
      'only-if-cached': true
    })

    directives = parseCacheControlHeader('max-age=10, private="some-header, another-one", only-if-cached')
    deepStrictEqual(directives, {
      'max-age': 10,
      private: [
        'some-header',
        'another-one'
      ],
      'only-if-cached': true
    })

    // Missing ending quote is invalid; handle it as the safer unqualified
    // directive without allowing permissive directive injection.
    directives = parseCacheControlHeader('max-age=10, private="some-header, another-one, only-if-cached')
    deepStrictEqual(directives, {
      'max-age': 10,
      private: true
    })
  })

  test('does not parse quoted no-cache/private field-list parts as directives', () => {
    let directives = parseCacheControlHeader('private="set-cookie, max-age=60"')
    deepStrictEqual(directives, {
      private: true
    })

    directives = parseCacheControlHeader('private="set-cookie, max-age=60')
    deepStrictEqual(directives, {
      private: true
    })

    directives = parseCacheControlHeader('no-cache, no-cache="set-cookie"')
    deepStrictEqual(directives, {
      'no-cache': true
    })

    directives = parseCacheControlHeader('public, max-age=60, no-cache="set-cookie" garbage, no-store')
    deepStrictEqual(directives, {
      public: true,
      'max-age': 60,
      'no-cache': [
        'set-cookie'
      ],
      'no-store': true
    })

    directives = parseCacheControlHeader('public, max-age=60, no-cache="set-cookie" garbage, no-cache="authorization"')
    deepStrictEqual(directives, {
      public: true,
      'max-age': 60,
      'no-cache': [
        'set-cookie',
        'authorization'
      ]
    })

    directives = parseCacheControlHeader('private="set-cookie, max-age=60" garbage, no-store')
    deepStrictEqual(directives, {
      private: true,
      'no-store': true
    })

    directives = parseCacheControlHeader('public, max-age=60, no-cache="set-cookie, no-store')
    deepStrictEqual(directives, {
      public: true,
      'max-age': 60,
      'no-cache': true,
      'no-store': true
    })
  })

  test('malformed no-cache/private field lists are handled as unqualified directives', () => {
    let directives = parseCacheControlHeader('public, max-age=60, no-cache=""')
    deepStrictEqual(directives, {
      public: true,
      'max-age': 60,
      'no-cache': true
    })

    directives = parseCacheControlHeader('public, max-age=60, no-cache=')
    deepStrictEqual(directives, {
      public: true,
      'max-age': 60,
      'no-cache': true
    })

    directives = parseCacheControlHeader('private=')
    deepStrictEqual(directives, {
      private: true
    })

    directives = parseCacheControlHeader('private="set cookie"')
    deepStrictEqual(directives, {
      private: true
    })

    directives = parseCacheControlHeader('no-cache="set-cookie, set cookie"')
    deepStrictEqual(directives, {
      'no-cache': true
    })
  })

  test('handles multiple headers correctly', () => {
    // For requests like
    //  cache-control: max-stale=1
    //  cache-control: min-fresh-1
    //  ...
    const directives = parseCacheControlHeader([
      'max-stale=1',
      'min-fresh=1',
      'max-age=1',
      's-maxage=1',
      'stale-while-revalidate=1',
      'stale-if-error=1',
      'public',
      'private',
      'no-store',
      'no-cache',
      'must-revalidate',
      'proxy-revalidate',
      'immutable',
      'no-transform',
      'must-understand',
      'only-if-cached'
    ])
    deepStrictEqual(directives, {
      'max-stale': 1,
      'min-fresh': 1,
      'max-age': 1,
      's-maxage': 1,
      'stale-while-revalidate': 1,
      'stale-if-error': 1,
      public: true,
      private: true,
      'no-store': true,
      'no-cache': true,
      'must-revalidate': true,
      'proxy-revalidate': true,
      immutable: true,
      'no-transform': true,
      'must-understand': true,
      'only-if-cached': true
    })
  })
})

describe('parseVaryHeader', () => {
  test('basic usage', () => {
    const output = parseVaryHeader('some-header, another-one', {
      'some-header': 'asd',
      'another-one': '123',
      'third-header': 'cool'
    })
    deepStrictEqual(output, {
      'some-header': 'asd',
      'another-one': '123'
    })
  })

  test('handles weird spacings', () => {
    const output = parseVaryHeader('some-header,    another-one,something-else', {
      'some-header': 'asd',
      'another-one': '123',
      'something-else': 'asd123',
      'third-header': 'cool'
    })
    deepStrictEqual(output, {
      'some-header': 'asd',
      'another-one': '123',
      'something-else': 'asd123'
    })
  })

  test('handles multiple headers correctly', () => {
    const output = parseVaryHeader(['some-header', 'another-one'], {
      'some-header': 'asd',
      'another-one': '123',
      'third-header': 'cool'
    })
    deepStrictEqual(output, {
      'some-header': 'asd',
      'another-one': '123'
    })
  })

  test('handles missing headers with null', () => {
    const result = parseVaryHeader('Accept-Encoding, Authorization', {})
    deepStrictEqual(result, {
      'accept-encoding': null,
      authorization: null
    })
  })

  test('handles mix of present and missing headers', () => {
    const result = parseVaryHeader('Accept-Encoding, Authorization', {
      authorization: 'example-value'
    })
    deepStrictEqual(result, {
      'accept-encoding': null,
      authorization: 'example-value'
    })
  })

  test('handles array input', () => {
    let result = parseVaryHeader(['Accept-Encoding', 'Authorization'], {
      'accept-encoding': 'gzip'
    })
    deepStrictEqual(result, {
      'accept-encoding': 'gzip',
      authorization: null
    })

    result = parseVaryHeader(['Accept-Encoding, Authorization', 'Cookie'], {
      'accept-encoding': 'gzip',
      cookie: 'session=abc'
    })
    deepStrictEqual(result, {
      'accept-encoding': 'gzip',
      authorization: null,
      cookie: 'session=abc'
    })
  })

  test('invalid field names are rejected', () => {
    strictEqual(parseVaryHeader('Accept-Encoding, Cookie Authorization', {}), undefined)
    strictEqual(parseVaryHeader(['Accept-Encoding', 'Cookie Authorization'], {}), undefined)
    strictEqual(parseVaryHeader('Cookie\u00a0', {}), undefined)
  })

  test('preserves existing * behavior', () => {
    const headers = { accept: 'text/html' }
    const result = parseVaryHeader('*', headers)
    deepStrictEqual(result, headers)
  })
})

describe('isEtagUsable', () => {
  const valuesToTest = {
    // Invalid etags
    '': false,
    asd: false,
    '"W/"asd""': false,
    '""asd""': false,

    // Valid etags
    '"asd"': true,
    'W/"ads"': true,

    // Spec deviations
    '""': false,
    'W/""': false
  }

  for (const key in valuesToTest) {
    const expectedValue = valuesToTest[key]
    test(`\`${key}\` = ${expectedValue}`, () => {
      equal(isEtagUsable(key), expectedValue)
    })
  }
})
