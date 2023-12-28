'use strict'

const { describe, test } = require('node:test')
const assert = require('node:assert')

const {
  deleteCookie,
  getCookies,
  getSetCookies,
  setCookie
} = require('../..')
const { getHeadersList } = require('../../lib/cookies/util')

describe('Using global Headers', { skip: !globalThis.Headers && 'No global Headers to test' }, () => {
  test('deleteCookies', () => {
    const headers = new Headers()

    assert.strictEqual(headers.get('set-cookie'), null)
    deleteCookie(headers, 'undici')
    assert.strictEqual(headers.get('set-cookie'), 'undici=; Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })

  test('getCookies', () => {
    const headers = new Headers({
      cookie: 'get=cookies; and=attributes'
    })

    assert.deepStrictEqual(getCookies(headers), { get: 'cookies', and: 'attributes' })
  })

  test('getSetCookies', () => {
    const headers = new Headers({
      'set-cookie': 'undici=getSetCookies; Secure'
    })

    const supportsCookies = getHeadersList(headers).cookies

    if (!supportsCookies) {
      assert.deepStrictEqual(getSetCookies(headers), [])
    } else {
      assert.deepStrictEqual(getSetCookies(headers), [
        {
          name: 'undici',
          value: 'getSetCookies',
          secure: true
        }
      ])
    }
  })

  test('setCookie', () => {
    const headers = new Headers()

    setCookie(headers, { name: 'undici', value: 'setCookie' })
    assert.strictEqual(headers.get('Set-Cookie'), 'undici=setCookie')
  })
})
