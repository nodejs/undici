'use strict'

const { describe, test } = require('node:test')
const assert = require('node:assert')
const {
  deleteCookie,
  getCookies,
  getSetCookies,
  setCookie
} = require('../..')

describe('Using global Headers', async () => {
  test('deleteCookies', { skip: !globalThis.Headers }, () => {
    const headers = new globalThis.Headers()

    assert.equal(headers.get('set-cookie'), null)
    deleteCookie(headers, 'undici')
    assert.equal(headers.get('set-cookie'), 'undici=; Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })

  test('getCookies', { skip: !globalThis.Headers }, () => {
    const headers = new globalThis.Headers({
      cookie: 'get=cookies; and=attributes'
    })

    assert.deepEqual(getCookies(headers), { get: 'cookies', and: 'attributes' })
  })

  test('getSetCookies', { skip: !globalThis.Headers }, () => {
    const headers = new globalThis.Headers({
      'set-cookie': 'undici=getSetCookies; Secure'
    })

    const supportsCookies = headers.getSetCookie()

    if (!supportsCookies) {
      assert.deepEqual(getSetCookies(headers), [])
    } else {
      assert.deepEqual(getSetCookies(headers), [
        {
          name: 'undici',
          value: 'getSetCookies',
          secure: true
        }
      ])
    }
  })

  test('setCookie', { skip: !globalThis.Headers }, () => {
    const headers = new globalThis.Headers()

    setCookie(headers, { name: 'undici', value: 'setCookie' })
    assert.equal(headers.get('Set-Cookie'), 'undici=setCookie')
  })
})

describe('Headers check is not too lax', { skip: !globalThis.Headers }, () => {
  class Headers { }
  Object.defineProperty(globalThis.Headers.prototype, Symbol.toStringTag, {
    value: 'Headers',
    configurable: true
  })

  assert.throws(() => getCookies(new Headers()), { code: 'ERR_INVALID_THIS' })
  assert.throws(() => getSetCookies(new Headers()), { code: 'ERR_INVALID_THIS' })
  assert.throws(() => setCookie(new Headers(), { name: 'a', value: 'b' }), { code: 'ERR_INVALID_THIS' })
  assert.throws(() => deleteCookie(new Headers(), 'name'), { code: 'ERR_INVALID_THIS' })
})
