'use strict'

const { describe, test } = require('node:test')
const { deepStrictEqual, equal } = require('node:assert')
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

  test('directives with incorrect types are ignored', () => {
    const directives = parseCacheControlHeader('max-age=true, only-if-cached=123')
    deepStrictEqual(directives, {})
  })

  test('the last instance of a directive takes precedence', () => {
    const directives = parseCacheControlHeader('max-age=1, max-age=2')
    deepStrictEqual(directives, { 'max-age': 2 })
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

    // Missing ending quote, invalid & should be skipped
    directives = parseCacheControlHeader('max-age=10, private="some-header, another-one, only-if-cached')
    deepStrictEqual(directives, {
      'max-age': 10,
      'only-if-cached': true
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
