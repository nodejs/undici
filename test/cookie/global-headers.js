'use strict'

const { describe, test } = require('node:test')
const assert = require('node:assert')
const {
  deleteCookie,
  getCookies,
  getSetCookies,
  setCookie
} = require('../..')
const { getHeadersList } = require('../../lib/web/cookies/util')

describe('Using global Headers', async () => {
  test('deleteCookies', () => {
    const headers = new Headers()

    assert.equal(headers.get('set-cookie'), null)
    deleteCookie(headers, 'undici')
    assert.equal(headers.get('set-cookie'), 'undici=; Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })

  test('getCookies', () => {
    const headers = new Headers({
      cookie: 'get=cookies; and=attributes'
    })

    assert.deepEqual(getCookies(headers), { get: 'cookies', and: 'attributes' })
  })

  test('getSetCookies', () => {
    const headers = new Headers({
      'set-cookie': 'undici=getSetCookies; Secure'
    })

    const supportsCookies = getHeadersList(headers).cookies

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

  test('setCookie', () => {
    const headers = new Headers()

    setCookie(headers, { name: 'undici', value: 'setCookie' })
    assert.equal(headers.get('Set-Cookie'), 'undici=setCookie')
  })
})
