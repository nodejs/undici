'use strict'

const { describe, test } = require('node:test')
const assert = require('node:assert')
const { tspl } = require('@matteo.collina/tspl')
const util = require('../../lib/web/fetch/util')
const { HeadersList } = require('../../lib/web/fetch/headers')
const { createHash } = require('node:crypto')

test('responseURL', (t) => {
  const { ok } = tspl(t, { plan: 2 })

  ok(util.responseURL({
    urlList: [
      new URL('http://asd'),
      new URL('http://fgh')
    ]
  }))
  ok(!util.responseURL({
    urlList: []
  }))
})

test('responseLocationURL', (t) => {
  const { ok } = tspl(t, { plan: 3 })

  const acceptHeaderList = new HeadersList()
  acceptHeaderList.append('Accept', '*/*')

  const locationHeaderList = new HeadersList()
  locationHeaderList.append('Location', 'http://asd')

  ok(!util.responseLocationURL({
    status: 200
  }))
  ok(!util.responseLocationURL({
    status: 301,
    headersList: acceptHeaderList
  }))
  ok(util.responseLocationURL({
    status: 301,
    headersList: locationHeaderList,
    urlList: [
      new URL('http://asd'),
      new URL('http://fgh')
    ]
  }))
})

test('requestBadPort', (t) => {
  const { strictEqual } = tspl(t, { plan: 3 })

  strictEqual('allowed', util.requestBadPort({
    urlList: [new URL('https://asd')]
  }))
  strictEqual('blocked', util.requestBadPort({
    urlList: [new URL('http://asd:7')]
  }))
  strictEqual('blocked', util.requestBadPort({
    urlList: [new URL('https://asd:7')]
  }))
})

// https://html.spec.whatwg.org/multipage/origin.html#same-origin
// look at examples
test('sameOrigin', async (t) => {
  await t.test('first test', () => {
    const A = {
      protocol: 'https:',
      hostname: 'example.org',
      port: ''
    }

    const B = {
      protocol: 'https:',
      hostname: 'example.org',
      port: ''
    }

    assert.ok(util.sameOrigin(A, B))
  })

  await t.test('second test', () => {
    const A = {
      protocol: 'https:',
      hostname: 'example.org',
      port: '314'
    }

    const B = {
      protocol: 'https:',
      hostname: 'example.org',
      port: '420'
    }

    assert.ok(!util.sameOrigin(A, B))
  })

  await t.test('obviously shouldn\'t be equal', () => {
    assert.ok(!util.sameOrigin(
      { protocol: 'http:', hostname: 'example.org' },
      { protocol: 'https:', hostname: 'example.org' }
    ))

    assert.ok(!util.sameOrigin(
      { protocol: 'https:', hostname: 'example.org' },
      { protocol: 'https:', hostname: 'example.com' }
    ))
  })

  await t.test('file:// urls', () => {
    // urls with opaque origins should return true

    const a = new URL('file:///C:/undici')
    const b = new URL('file:///var/undici')

    assert.ok(util.sameOrigin(a, b))
  })
})

test('isURLPotentiallyTrustworthy', (t) => {
  // https://datatracker.ietf.org/doc/html/draft-ietf-dnsop-let-localhost-be-localhost#section-5.2
  const valid = [
    'http://localhost',
    'http://localhost.',
    'http://127.0.0.1',
    'http://[::1]',
    'https://something.com',
    'wss://hello.com',
    'data:text/plain;base64,randomstring',
    'about:blank',
    'about:srcdoc',
    'http://subdomain.localhost',
    'http://subdomain.localhost.',
    'http://adb.localhost',
    'http://localhost.localhost',
    'blob:http://example.com/550e8400-e29b-41d4-a716-446655440000'
  ]
  const invalid = [
    'http://localhost.example.com',
    'http://subdomain.localhost.example.com',
    'file:///link/to/file.txt',
    'http://121.3.4.5:55',
    'null:8080',
    'something:8080'
  ]

  // t.plan(valid.length + invalid.length + 1)
  const { ok } = tspl(t, { plan: valid.length + invalid.length + 1 })
  ok(!util.isURLPotentiallyTrustworthy('string'))

  for (const url of valid) {
    const instance = new URL(url)
    ok(util.isURLPotentiallyTrustworthy(instance), instance)
  }

  for (const url of invalid) {
    const instance = new URL(url)
    ok(!util.isURLPotentiallyTrustworthy(instance))
  }
})

describe('setRequestReferrerPolicyOnRedirect', () => {
  [
    [
      'should ignore empty string as policy',
      'origin, asdas, asdaw34, no-referrer,,',
      'no-referrer'
    ],
    [
      'should set referrer policy from response headers on redirect',
      'origin',
      'origin'
    ],
    [
      'should select the first valid policy from a response',
      'asdas, origin',
      'origin'
    ],
    [
      'should select the first valid policy from a response#2',
      'no-referrer, asdas, origin, 0943sd',
      'origin'
    ],
    [
      'should pick the last fallback over invalid policy tokens',
      'origin, asdas, asdaw34',
      'origin'
    ],
    [
      'should set not change request referrer policy if no Referrer-Policy from initial redirect response',
      null,
      'no-referrer, strict-origin-when-cross-origin'
    ],
    [
      'should set not change request referrer policy if the policy is a non-valid Referrer Policy',
      'asdasd',
      'no-referrer, strict-origin-when-cross-origin'
    ],
    [
      'should set not change request referrer policy if the policy is a non-valid Referrer Policy #2',
      'asdasd, asdasa, 12daw,',
      'no-referrer, strict-origin-when-cross-origin'
    ]
  ].forEach(([title, responseReferrerPolicy, expected]) => {
    test(title, (t) => {
      const request = {
        referrerPolicy: 'no-referrer, strict-origin-when-cross-origin'
      }

      const actualResponse = {
        headersList: new HeadersList()
      }

      const { strictEqual } = tspl(t, { plan: 1 })

      actualResponse.headersList.append('Connection', 'close')
      actualResponse.headersList.append('Location', 'https://some-location.com/redirect')
      if (responseReferrerPolicy) {
        actualResponse.headersList.append('Referrer-Policy', responseReferrerPolicy)
      }
      util.setRequestReferrerPolicyOnRedirect(request, actualResponse)

      strictEqual(request.referrerPolicy, expected)
    })
  })
})

test('parseMetadata', async (t) => {
  await t.test('should parse valid metadata with option', () => {
    const body = 'Hello world!'
    const hash256 = createHash('sha256').update(body).digest('base64')
    const hash384 = createHash('sha384').update(body).digest('base64')
    const hash512 = createHash('sha512').update(body).digest('base64')

    const validMetadata = `sha256-${hash256} !@ sha384-${hash384} !@ sha512-${hash512} !@`
    const result = util.parseMetadata(validMetadata)

    assert.deepEqual(result, [
      { algo: 'sha256', hash: hash256.replace(/=/g, '') },
      { algo: 'sha384', hash: hash384.replace(/=/g, '') },
      { algo: 'sha512', hash: hash512.replace(/=/g, '') }
    ])
  })

  await t.test('should parse valid metadata with non ASCII chars option', () => {
    const body = 'Hello world!'
    const hash256 = createHash('sha256').update(body).digest('base64')
    const hash384 = createHash('sha384').update(body).digest('base64')
    const hash512 = createHash('sha512').update(body).digest('base64')

    const validMetadata = `sha256-${hash256} !© sha384-${hash384} !€ sha512-${hash512} !µ`
    const result = util.parseMetadata(validMetadata)

    assert.deepEqual(result, [
      { algo: 'sha256', hash: hash256.replace(/=/g, '') },
      { algo: 'sha384', hash: hash384.replace(/=/g, '') },
      { algo: 'sha512', hash: hash512.replace(/=/g, '') }
    ])
  })

  await t.test('should parse valid metadata without option', () => {
    const body = 'Hello world!'
    const hash256 = createHash('sha256').update(body).digest('base64')
    const hash384 = createHash('sha384').update(body).digest('base64')
    const hash512 = createHash('sha512').update(body).digest('base64')

    const validMetadata = `sha256-${hash256} sha384-${hash384} sha512-${hash512}`
    const result = util.parseMetadata(validMetadata)

    assert.deepEqual(result, [
      { algo: 'sha256', hash: hash256.replace(/=/g, '') },
      { algo: 'sha384', hash: hash384.replace(/=/g, '') },
      { algo: 'sha512', hash: hash512.replace(/=/g, '') }
    ])
  })

  await t.test('should set hash as undefined when invalid base64 chars are provided', () => {
    const body = 'Hello world!'
    const hash256 = createHash('sha256').update(body).digest('base64')
    const invalidHash384 = 'zifp5hE1Xl5LQQqQz[]Bq/iaq9Wb6jVb//T7EfTmbXD2aEP5c2ZdJr9YTDfcTE1ZH+'
    const hash512 = createHash('sha512').update(body).digest('base64')

    const validMetadata = `sha256-${hash256} sha384-${invalidHash384} sha512-${hash512}`
    const result = util.parseMetadata(validMetadata)

    assert.deepEqual(result, [
      { algo: 'sha256', hash: hash256.replace(/=/g, '') },
      { algo: 'sha384', hash: undefined },
      { algo: 'sha512', hash: hash512.replace(/=/g, '') }
    ])
  })
})

describe('urlHasHttpsScheme', () => {
  const { urlHasHttpsScheme } = util

  test('should return false for http url', () => {
    assert.strictEqual(urlHasHttpsScheme('http://example.com'), false)
  })
  test('should return true for https url', () => {
    assert.strictEqual(urlHasHttpsScheme('https://example.com'), true)
  })
  test('should return false for http object', () => {
    assert.strictEqual(urlHasHttpsScheme({ protocol: 'http:' }), false)
  })
  test('should return true for https object', () => {
    assert.strictEqual(urlHasHttpsScheme({ protocol: 'https:' }), true)
  })
})

describe('isValidHeaderValue', () => {
  const { isValidHeaderValue } = util

  test('should return true for valid string', () => {
    assert.strictEqual(isValidHeaderValue('valid123'), true)
    assert.strictEqual(isValidHeaderValue('va lid123'), true)
    assert.strictEqual(isValidHeaderValue('va\tlid123'), true)
  })
  test('should return false for string containing NUL', () => {
    assert.strictEqual(isValidHeaderValue('invalid\0'), false)
    assert.strictEqual(isValidHeaderValue('in\0valid'), false)
    assert.strictEqual(isValidHeaderValue('\0invalid'), false)
  })
  test('should return false for string containing CR', () => {
    assert.strictEqual(isValidHeaderValue('invalid\r'), false)
    assert.strictEqual(isValidHeaderValue('in\rvalid'), false)
    assert.strictEqual(isValidHeaderValue('\rinvalid'), false)
  })
  test('should return false for string containing LF', () => {
    assert.strictEqual(isValidHeaderValue('invalid\n'), false)
    assert.strictEqual(isValidHeaderValue('in\nvalid'), false)
    assert.strictEqual(isValidHeaderValue('\ninvalid'), false)
  })

  test('should return false for string with leading TAB', () => {
    assert.strictEqual(isValidHeaderValue('\tinvalid'), false)
  })
  test('should return false for string with trailing TAB', () => {
    assert.strictEqual(isValidHeaderValue('invalid\t'), false)
  })
  test('should return false for string with leading SPACE', () => {
    assert.strictEqual(isValidHeaderValue(' invalid'), false)
  })
  test('should return false for string with trailing SPACE', () => {
    assert.strictEqual(isValidHeaderValue('invalid '), false)
  })
})

describe('isOriginIPPotentiallyTrustworthy()', () => {
  [
    ['0000:0000:0000:0000:0000:0000:0000:0001', true],
    ['0001:0000:0000:0000:0000:0000:0000:0001', false],
    ['0000:0000:0000:0000:0000:0000::0001', true],
    ['0001:0000:0000:0000:0000:0000::0001', false],
    ['0000:0000:0001:0000:0000:0000::0001', false],
    ['0000:0000:0000:0000:0000::0001', true],
    ['0000:0000:0000:0000::0001', true],
    ['0000:0000:0000::0001', true],
    ['0000:0000::0001', true],
    ['0000::0001', true],
    ['::0001', true],
    ['::1', true],
    ['[::1]', true],
    ['::2', false],
    ['::', false],
    ['127.0.0.1', true],
    ['127.255.255.255', true],
    ['128.255.255.255', false],
    ['127.0.0.1', true],
    ['127.0.0.0', false]
  ].forEach(([ip, expected]) => {
    test(`${ip} is ${expected ? '' : 'not '}potentially trustworthy`, () => {
      assert.strictEqual(util.isOriginIPPotentiallyTrustworthy(ip), expected)
    })
  })
})
