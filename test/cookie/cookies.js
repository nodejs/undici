// MIT License
//
// Copyright 2018-2022 the Deno authors.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

'use strict'

const { test } = require('node:test')
const {
  deleteCookie,
  getCookies,
  getSetCookies,
  setCookie,
  Headers
} = require('../..')

// https://raw.githubusercontent.com/denoland/deno_std/b4239898d6c6b4cdbfd659a4ea1838cf4e656336/http/cookie_test.ts

test('Cookie parser', (t) => {
  let headers = new Headers()
  t.assert.deepEqual(getCookies(headers), {})
  headers = new Headers()
  headers.set('Cookie', 'foo=bar')
  t.assert.deepEqual(getCookies(headers), { foo: 'bar' })

  headers = new Headers()
  headers.set('Cookie', 'full=of  ; tasty=chocolate')
  t.assert.deepEqual(getCookies(headers), { full: 'of  ', tasty: 'chocolate' })

  headers = new Headers()
  headers.set('Cookie', 'igot=99; problems=but...')
  t.assert.deepEqual(getCookies(headers), { igot: '99', problems: 'but...' })

  headers = new Headers()
  headers.set('Cookie', 'PREF=al=en-GB&f1=123; wide=1; SID=123')
  t.assert.deepEqual(getCookies(headers), {
    PREF: 'al=en-GB&f1=123',
    wide: '1',
    SID: '123'
  })
})

test('Cookie Name Validation', (t) => {
  const tokens = [
    '"id"',
    'id\t',
    'i\td',
    'i d',
    'i;d',
    '{id}',
    '[id]',
    '"',
    'id\u0091'
  ]
  const headers = new Headers()
  tokens.forEach((name) => {
    t.assert.throws(
      () => {
        setCookie(headers, {
          name,
          value: 'Cat',
          httpOnly: true,
          secure: true,
          maxAge: 3
        })
      },
      new Error('Invalid cookie name')
    )
  })
})

test('Cookie Value Validation', (t) => {
  const tokens = [
    '1f\tWa',
    '\t',
    '1f Wa',
    '1f;Wa',
    '"1fWa',
    '1f\\Wa',
    '1f"Wa',
    '"',
    '1fWa\u0005',
    '1f\u0091Wa'
  ]

  const headers = new Headers()
  tokens.forEach((value) => {
    t.assert.throws(
      () => {
        setCookie(
          headers,
          {
            name: 'Space',
            value,
            httpOnly: true,
            secure: true,
            maxAge: 3
          }
        )
      },
      new Error('Invalid cookie value'),
      "RFC2616 cookie 'Space'"
    )
  })

  t.assert.throws(
    () => {
      setCookie(headers, {
        name: 'location',
        value: 'United Kingdom'
      })
    },
    new Error('Invalid cookie value'),
    "RFC2616 cookie 'location' cannot contain character ' '"
  )
})

test('Cookie Path Validation', (t) => {
  const path = '/;domain=sub.domain.com'
  const headers = new Headers()
  t.assert.throws(
    () => {
      setCookie(headers, {
        name: 'Space',
        value: 'Cat',
        httpOnly: true,
        secure: true,
        path,
        maxAge: 3
      })
    },
    new Error('Invalid cookie path'),
    path + ": Invalid cookie path char ';'"
  )
})

test('Cookie Domain Validation', (t) => {
  const tokens = ['-domain.com', 'domain.org.', 'domain.org-']
  const headers = new Headers()
  tokens.forEach((domain) => {
    t.assert.throws(
      () => {
        setCookie(headers, {
          name: 'Space',
          value: 'Cat',
          httpOnly: true,
          secure: true,
          domain,
          maxAge: 3
        })
      },
      new Error('Invalid cookie domain'),
      'Invalid first/last char in cookie domain: ' + domain
    )
  })
})

test('Cookie Delete', (t) => {
  let headers = new Headers()
  deleteCookie(headers, 'deno')
  t.assert.strictEqual(
    headers.get('Set-Cookie'),
    'deno=; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  )
  headers = new Headers()
  setCookie(headers, {
    name: 'Space',
    value: 'Cat',
    domain: 'deno.land',
    path: '/'
  })
  deleteCookie(headers, 'Space', { domain: '', path: '' })
  t.assert.strictEqual(
    headers.get('Set-Cookie'),
    'Space=Cat; Domain=deno.land; Path=/, Space=; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  )
})

test('Cookie Set', (t) => {
  let headers = new Headers()
  setCookie(headers, { name: 'Space', value: 'Cat' })
  t.assert.strictEqual(headers.get('Set-Cookie'), 'Space=Cat')

  headers = new Headers()
  setCookie(headers, { name: 'Space', value: 'Cat', secure: true })
  t.assert.strictEqual(headers.get('Set-Cookie'), 'Space=Cat; Secure')

  headers = new Headers()
  setCookie(headers, { name: 'Space', value: 'Cat', httpOnly: true })
  t.assert.strictEqual(headers.get('Set-Cookie'), 'Space=Cat; HttpOnly')

  headers = new Headers()
  setCookie(headers, {
    name: 'Space',
    value: 'Cat',
    httpOnly: true,
    secure: true
  })
  t.assert.strictEqual(headers.get('Set-Cookie'), 'Space=Cat; Secure; HttpOnly')

  headers = new Headers()
  setCookie(headers, {
    name: 'Space',
    value: 'Cat',
    httpOnly: true,
    secure: true,
    maxAge: 2
  })
  t.assert.strictEqual(
    headers.get('Set-Cookie'),
    'Space=Cat; Secure; HttpOnly; Max-Age=2'
  )

  headers = new Headers()
  setCookie(headers, {
    name: 'Space',
    value: 'Cat',
    httpOnly: true,
    secure: true,
    maxAge: 0
  })
  t.assert.strictEqual(
    headers.get('Set-Cookie'),
    'Space=Cat; Secure; HttpOnly; Max-Age=0'
  )

  let error = false
  headers = new Headers()
  try {
    setCookie(headers, {
      name: 'Space',
      value: 'Cat',
      httpOnly: true,
      secure: true,
      maxAge: -1
    })
  } catch {
    error = true
  }
  t.assert.ok(error)

  headers = new Headers()
  setCookie(headers, {
    name: 'Space',
    value: 'Cat',
    httpOnly: true,
    secure: true,
    maxAge: 2,
    domain: 'deno.land'
  })
  t.assert.strictEqual(
    headers.get('Set-Cookie'),
    'Space=Cat; Secure; HttpOnly; Max-Age=2; Domain=deno.land'
  )

  headers = new Headers()
  setCookie(headers, {
    name: 'Space',
    value: 'Cat',
    httpOnly: true,
    secure: true,
    maxAge: 2,
    domain: 'deno.land',
    sameSite: 'Strict'
  })
  t.assert.strictEqual(
    headers.get('Set-Cookie'),
    'Space=Cat; Secure; HttpOnly; Max-Age=2; Domain=deno.land; ' +
        'SameSite=Strict'
  )

  headers = new Headers()
  setCookie(headers, {
    name: 'Space',
    value: 'Cat',
    httpOnly: true,
    secure: true,
    maxAge: 2,
    domain: 'deno.land',
    sameSite: 'Lax'
  })
  t.assert.strictEqual(
    headers.get('Set-Cookie'),
    'Space=Cat; Secure; HttpOnly; Max-Age=2; Domain=deno.land; SameSite=Lax'
  )

  headers = new Headers()
  setCookie(headers, {
    name: 'Space',
    value: 'Cat',
    httpOnly: true,
    secure: true,
    maxAge: 2,
    domain: 'deno.land',
    path: '/'
  })
  t.assert.strictEqual(
    headers.get('Set-Cookie'),
    'Space=Cat; Secure; HttpOnly; Max-Age=2; Domain=deno.land; Path=/'
  )

  headers = new Headers()
  setCookie(headers, {
    name: 'Space',
    value: 'Cat',
    httpOnly: true,
    secure: true,
    maxAge: 2,
    domain: 'deno.land',
    path: '/',
    unparsed: ['unparsed=keyvalue', 'batman=Bruce']
  })
  t.assert.strictEqual(
    headers.get('Set-Cookie'),
    'Space=Cat; Secure; HttpOnly; Max-Age=2; Domain=deno.land; Path=/; ' +
        'unparsed=keyvalue; batman=Bruce'
  )

  headers = new Headers()
  setCookie(headers, {
    name: 'Space',
    value: 'Cat',
    httpOnly: true,
    secure: true,
    maxAge: 2,
    domain: 'deno.land',
    path: '/',
    expires: new Date(Date.UTC(1983, 0, 7, 15, 32))
  })
  t.assert.strictEqual(
    headers.get('Set-Cookie'),
    'Space=Cat; Secure; HttpOnly; Max-Age=2; Domain=deno.land; Path=/; ' +
        'Expires=Fri, 07 Jan 1983 15:32:00 GMT'
  )

  headers = new Headers()
  setCookie(headers, {
    name: 'Space',
    value: 'Cat',
    expires: Date.UTC(1983, 0, 7, 15, 32)
  })
  t.assert.strictEqual(
    headers.get('Set-Cookie'),
    'Space=Cat; Expires=Fri, 07 Jan 1983 15:32:00 GMT'
  )

  headers = new Headers()
  setCookie(headers, { name: '__Secure-Kitty', value: 'Meow' })
  t.assert.strictEqual(headers.get('Set-Cookie'), '__Secure-Kitty=Meow; Secure')

  headers = new Headers()
  setCookie(headers, {
    name: '__Host-Kitty',
    value: 'Meow',
    domain: 'deno.land'
  })
  t.assert.strictEqual(
    headers.get('Set-Cookie'),
    '__Host-Kitty=Meow; Secure; Path=/'
  )

  headers = new Headers()
  setCookie(headers, { name: 'cookie-1', value: 'value-1', secure: true })
  setCookie(headers, { name: 'cookie-2', value: 'value-2', maxAge: 3600 })
  t.assert.strictEqual(
    headers.get('Set-Cookie'),
    'cookie-1=value-1; Secure, cookie-2=value-2; Max-Age=3600'
  )

  headers = new Headers()
  setCookie(headers, { name: '', value: '' })
  t.assert.strictEqual(headers.get('Set-Cookie'), null)
})

test('Set-Cookie parser', (t) => {
  let headers = new Headers({ 'set-cookie': 'Space=Cat' })
  t.assert.deepEqual(getSetCookies(headers), [{
    name: 'Space',
    value: 'Cat'
  }])

  headers = new Headers({ 'set-cookie': 'Space=Cat; Secure' })
  t.assert.deepEqual(getSetCookies(headers), [{
    name: 'Space',
    value: 'Cat',
    secure: true
  }])

  headers = new Headers({ 'set-cookie': 'Space=Cat; HttpOnly' })
  t.assert.deepEqual(getSetCookies(headers), [{
    name: 'Space',
    value: 'Cat',
    httpOnly: true
  }])

  headers = new Headers({ 'set-cookie': 'Space=Cat; Secure; HttpOnly' })
  t.assert.deepEqual(getSetCookies(headers), [{
    name: 'Space',
    value: 'Cat',
    secure: true,
    httpOnly: true
  }])

  headers = new Headers({
    'set-cookie': 'Space=Cat; Secure; HttpOnly; Max-Age=2'
  })
  t.assert.deepEqual(getSetCookies(headers), [{
    name: 'Space',
    value: 'Cat',
    secure: true,
    httpOnly: true,
    maxAge: 2
  }])

  headers = new Headers({
    'set-cookie': 'Space=Cat; Secure; HttpOnly; Max-Age=0'
  })
  t.assert.deepEqual(getSetCookies(headers), [{
    name: 'Space',
    value: 'Cat',
    secure: true,
    httpOnly: true,
    maxAge: 0
  }])

  headers = new Headers({
    'set-cookie': 'Space=Cat; Secure; HttpOnly; Max-Age=-1'
  })
  t.assert.deepEqual(getSetCookies(headers), [{
    name: 'Space',
    value: 'Cat',
    secure: true,
    httpOnly: true
  }])

  headers = new Headers({
    'set-cookie': 'Space=Cat; Secure; HttpOnly; Max-Age=2; Domain=deno.land'
  })
  t.assert.deepEqual(getSetCookies(headers), [{
    name: 'Space',
    value: 'Cat',
    secure: true,
    httpOnly: true,
    maxAge: 2,
    domain: 'deno.land'
  }])

  headers = new Headers({
    'set-cookie':
        'Space=Cat; Secure; HttpOnly; Max-Age=2; Domain=deno.land; SameSite=Strict'
  })
  t.assert.deepEqual(getSetCookies(headers), [{
    name: 'Space',
    value: 'Cat',
    secure: true,
    httpOnly: true,
    maxAge: 2,
    domain: 'deno.land',
    sameSite: 'Strict'
  }])

  headers = new Headers({
    'set-cookie':
        'Space=Cat; Secure; HttpOnly; Max-Age=2; Domain=deno.land; SameSite=Lax'
  })
  t.assert.deepEqual(getSetCookies(headers), [{
    name: 'Space',
    value: 'Cat',
    secure: true,
    httpOnly: true,
    maxAge: 2,
    domain: 'deno.land',
    sameSite: 'Lax'
  }])

  headers = new Headers({
    'set-cookie':
        'Space=Cat; Secure; HttpOnly; Max-Age=2; Domain=deno.land; Path=/'
  })
  t.assert.deepEqual(getSetCookies(headers), [{
    name: 'Space',
    value: 'Cat',
    secure: true,
    httpOnly: true,
    maxAge: 2,
    domain: 'deno.land',
    path: '/'
  }])

  headers = new Headers({
    'set-cookie':
        'Space=Cat; Secure; HttpOnly; Max-Age=2; Domain=deno.land; Path=/; unparsed=keyvalue; batman=Bruce'
  })
  t.assert.deepEqual(getSetCookies(headers), [{
    name: 'Space',
    value: 'Cat',
    secure: true,
    httpOnly: true,
    maxAge: 2,
    domain: 'deno.land',
    path: '/',
    unparsed: ['unparsed=keyvalue', 'batman=Bruce']
  }])

  headers = new Headers({
    'set-cookie':
        'Space=Cat; Secure; HttpOnly; Max-Age=2; Domain=deno.land; Path=/; ' +
        'Expires=Fri, 07 Jan 1983 15:32:00 GMT'
  })
  t.assert.deepEqual(getSetCookies(headers), [{
    name: 'Space',
    value: 'Cat',
    secure: true,
    httpOnly: true,
    maxAge: 2,
    domain: 'deno.land',
    path: '/',
    expires: new Date(Date.UTC(1983, 0, 7, 15, 32))
  }])

  headers = new Headers({ 'set-cookie': '__Secure-Kitty=Meow; Secure' })
  t.assert.deepEqual(getSetCookies(headers), [{
    name: '__Secure-Kitty',
    value: 'Meow',
    secure: true
  }])

  headers = new Headers({ 'set-cookie': '__Secure-Kitty=Meow' })
  t.assert.deepEqual(getSetCookies(headers), [{
    name: '__Secure-Kitty',
    value: 'Meow'
  }])

  headers = new Headers({
    'set-cookie': '__Host-Kitty=Meow; Secure; Path=/'
  })
  t.assert.deepEqual(getSetCookies(headers), [{
    name: '__Host-Kitty',
    value: 'Meow',
    secure: true,
    path: '/'
  }])

  headers = new Headers({ 'set-cookie': '__Host-Kitty=Meow; Path=/' })
  t.assert.deepEqual(getSetCookies(headers), [{
    name: '__Host-Kitty',
    value: 'Meow',
    path: '/'
  }])

  headers = new Headers({
    'set-cookie': '__Host-Kitty=Meow; Secure; Domain=deno.land; Path=/'
  })
  t.assert.deepEqual(getSetCookies(headers), [{
    name: '__Host-Kitty',
    value: 'Meow',
    secure: true,
    domain: 'deno.land',
    path: '/'
  }])

  headers = new Headers({
    'set-cookie': '__Host-Kitty=Meow; Secure; Path=/not-root'
  })
  t.assert.deepEqual(getSetCookies(headers), [{
    name: '__Host-Kitty',
    value: 'Meow',
    secure: true,
    path: '/not-root'
  }])

  headers = new Headers([
    ['set-cookie', 'cookie-1=value-1; Secure'],
    ['set-cookie', 'cookie-2=value-2; Max-Age=3600']
  ])
  t.assert.deepEqual(getSetCookies(headers), [
    { name: 'cookie-1', value: 'value-1', secure: true },
    { name: 'cookie-2', value: 'value-2', maxAge: 3600 }
  ])

  headers = new Headers()
  t.assert.deepEqual(getSetCookies(headers), [])
})

test('Cookie setCookie throws if headers is not of type Headers', (t) => {
  class Headers {
    [Symbol.toStringTag] = 'CustomHeaders'
  }
  const headers = new Headers()
  t.assert.throws(
    () => {
      setCookie(headers, {
        name: 'key',
        value: 'Cat',
        httpOnly: true,
        secure: true,
        maxAge: 3
      })
    },
    new TypeError('Illegal invocation')
  )
})

test('Cookie setCookie does not throw if headers is an instance of undici owns Headers class', (t) => {
  const headers = new Headers()
  setCookie(headers, {
    name: 'key',
    value: 'Cat',
    httpOnly: true,
    secure: true,
    maxAge: 3
  })
})

test('Cookie setCookie does not throw if headers is an instance of the global Headers class', { skip: !globalThis.Headers }, (t) => {
  const headers = new globalThis.Headers()
  setCookie(headers, {
    name: 'key',
    value: 'Cat',
    httpOnly: true,
    secure: true,
    maxAge: 3
  })
})

test('Cookie getCookies throws if headers is not of type Headers', (t) => {
  class Headers {
    [Symbol.toStringTag] = 'CustomHeaders'
  }
  const headers = new Headers()
  t.assert.throws(
    () => {
      getCookies(headers)
    },
    new TypeError('Illegal invocation')
  )
})

test('Cookie getCookies does not throw if headers is an instance of undici owns Headers class', (t) => {
  const headers = new Headers()
  getCookies(headers)
})

test('Cookie getCookie does not throw if headers is an instance of the global Headers class', { skip: !globalThis.Headers }, (t) => {
  const headers = new globalThis.Headers()
  getCookies(headers)
})

test('Cookie getSetCookies throws if headers is not of type Headers', (t) => {
  class Headers {
    [Symbol.toStringTag] = 'CustomHeaders'
  }
  const headers = new Headers({ 'set-cookie': 'Space=Cat' })
  t.assert.throws(
    () => {
      getSetCookies(headers)
    },
    new TypeError('Illegal invocation')
  )
})

test('Cookie getSetCookies does not throw if headers is an instance of undici owns Headers class', (t) => {
  const headers = new Headers({ 'set-cookie': 'Space=Cat' })
  getSetCookies(headers)
})

test('Cookie setCookie does not throw if headers is an instance of the global Headers class', { skip: !globalThis.Headers }, (t) => {
  const headers = new globalThis.Headers({ 'set-cookie': 'Space=Cat' })
  getSetCookies(headers)
})

test('Cookie deleteCookie throws if headers is not of type Headers', (t) => {
  class Headers {
    [Symbol.toStringTag] = 'CustomHeaders'
  }
  const headers = new Headers()
  t.assert.throws(
    () => {
      deleteCookie(headers, 'deno')
    },
    new TypeError('Illegal invocation')
  )
})

test('Cookie deleteCookie does not throw if headers is an instance of undici owns Headers class', (t) => {
  const headers = new Headers()
  deleteCookie(headers, 'deno')
})

test('Cookie getCookie does not throw if headers is an instance of the global Headers class', { skip: !globalThis.Headers }, (t) => {
  const headers = new globalThis.Headers()
  deleteCookie(headers, 'deno')
})
