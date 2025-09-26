'use strict'

const { describe, test } = require('node:test')
const {
  deleteCookie,
  getCookies,
  getSetCookies,
  setCookie
} = require('../..')

describe('Using global Headers', () => {
  test('deleteCookies', { skip: !globalThis.Headers }, (t) => {
    const headers = new globalThis.Headers()

    t.assert.strictEqual(headers.get('set-cookie'), null)
    deleteCookie(headers, 'undici')
    t.assert.strictEqual(headers.get('set-cookie'), 'undici=; Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })

  test('getCookies', { skip: !globalThis.Headers }, (t) => {
    const headers = new globalThis.Headers({
      cookie: 'get=cookies; and=attributes'
    })

    t.assert.deepEqual(getCookies(headers), { get: 'cookies', and: 'attributes' })
  })

  test('getSetCookies', { skip: !globalThis.Headers }, (t) => {
    const headers = new globalThis.Headers({
      'set-cookie': 'undici=getSetCookies; Secure'
    })

    const supportsCookies = headers.getSetCookie()

    if (!supportsCookies) {
      t.assert.deepEqual(getSetCookies(headers), [])
    } else {
      t.assert.deepEqual(getSetCookies(headers), [
        {
          name: 'undici',
          value: 'getSetCookies',
          secure: true
        }
      ])
    }
  })

  test('setCookie', { skip: !globalThis.Headers }, (t) => {
    const headers = new globalThis.Headers()

    setCookie(headers, { name: 'undici', value: 'setCookie' })
    t.assert.strictEqual(headers.get('Set-Cookie'), 'undici=setCookie')
  })

  test('Headers check is not too lax', { skip: !globalThis.Headers }, (t) => {
    class Headers { }
    Object.defineProperty(globalThis.Headers.prototype, Symbol.toStringTag, {
      value: 'Headers',
      configurable: true
    })

    t.assert.throws(() => getCookies(new Headers()), { code: 'ERR_INVALID_THIS' })
    t.assert.throws(() => getSetCookies(new Headers()), { code: 'ERR_INVALID_THIS' })
    t.assert.throws(() => setCookie(new Headers(), { name: 'a', value: 'b' }), { code: 'ERR_INVALID_THIS' })
    t.assert.throws(() => deleteCookie(new Headers(), 'name'), { code: 'ERR_INVALID_THIS' })
  })
})
