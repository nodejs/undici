'use strict'

const { test } = require('tap')
const { parseUnparsedAttributes, parseSetCookie } = require('../../lib/cookie-store/parse')

test('Parsing set-cookie header(s)', (t) => {
  t.same(
    parseSetCookie('hello'),
    { cookieName: '', cookieValue: 'hello', unparsedAttributes: '' }
  )

  t.same(
    parseSetCookie('hello=world'),
    { cookieName: 'hello', cookieValue: 'world', unparsedAttributes: '' }
  )

  t.equal(
    parseSetCookie(''.padEnd(2048, 'k') + '=' + ''.padEnd(2049, 'v')), // over 4096 chars
    null
  )

  t.equal(
    parseSetCookie('Key\x00=value'),
    null
  )

  t.end()
})

test('Parsing attributes', (t) => {
  t.test('no attributes', (t) => {
    t.same(parseUnparsedAttributes(''), {})

    t.end()
  })

  t.test('expires', (t) => {
    const attributes = parseUnparsedAttributes('; expires=Sun, 16 Jul 3567 06:23:41 GMT')

    t.ok('Expires' in attributes)
    t.equal(typeof attributes.Expires, 'number')

    const year = new Date(attributes.Expire * 1000).getFullYear()
    // The date maxes at 400 days in the future, cannot be > than 2 years.
    t.ok(year !== new Date().getFullYear())

    const attributes2 = parseUnparsedAttributes(`; expires=${new Date().toUTCString()}`)
    const date2 = new Date(attributes2.Expires * 1000)
    t.ok(Date.now() - date2.getTime() < 1000 * 60) // being generous

    t.end()
  })

  t.test('max-age', (t) => {
    const attributes = parseUnparsedAttributes('; Max-Age=2000')
    const diff = new Date(attributes['Max-Age']).getTime() - Date.now()

    // not always exactly 2 mill. just to be safe.
    t.ok(diff <= 2_000_000) // 2000 seconds -> ms
    t.ok(diff > 1_999_000)

    t.same(
      parseUnparsedAttributes('; Max-Age=Abcd'),
      {}
    )

    t.same(
      parseUnparsedAttributes('; Max-Age=0Abcd'),
      {}
    )

    t.end()
  })

  t.test('domain', (t) => {
    t.same(
      parseUnparsedAttributes('; Domain=.example.com'),
      { Domain: 'example.com' }
    )

    t.same(
      parseUnparsedAttributes('; Domain=example.com'),
      { Domain: 'example.com' }
    )

    t.same(
      parseUnparsedAttributes('; Domain=EXAMPLE.cOm'),
      { Domain: 'example.com' }
    )

    t.end()
  })

  t.test('path', (t) => {
    t.same(
      parseUnparsedAttributes('; Path=no-forward-slash'),
      { Path: '/' }
    )

    t.same(
      parseUnparsedAttributes('; Path=/forward-slash'),
      { Path: '/forward-slash' }
    )

    t.end()
  })

  t.test('secure', (t) => {
    t.same(
      parseUnparsedAttributes('; Secure'),
      { Secure: '' }
    )

    t.end()
  })

  t.test('httponly', (t) => {
    t.same(
      parseUnparsedAttributes('; HttpOnly'),
      { HttpOnly: '' }
    )

    t.end()
  })

  t.test('samesite', (t) => {
    t.same(
      parseUnparsedAttributes('; SameSite=what'),
      { SameSite: 'Default' }
    )

    t.same(
      parseUnparsedAttributes('; SameSite=none'),
      { SameSite: 'None' }
    )

    t.same(
      parseUnparsedAttributes('; SameSite=strict'),
      { SameSite: 'Strict' }
    )

    t.same(
      parseUnparsedAttributes('; SameSite=lax'),
      { SameSite: 'Lax' }
    )

    t.end()
  })

  t.test('invalid', (t) => {
    t.same(
      parseUnparsedAttributes(`; domain=${''.padEnd(1025, 'v')}`),
      {}
    )

    t.same(
      parseUnparsedAttributes('; unknown=something'),
      {}
    )

    t.end()
  })

  t.test('whitespace', (t) => {
    t.same(
      parseUnparsedAttributes(';      domain   =    value'),
      { Domain: 'value' }
    )

    t.end()
  })

  t.end()
})
