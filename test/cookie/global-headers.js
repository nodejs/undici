'use strict'

const { test, skip } = require('tap')
const {
  deleteCookie,
  getCookies,
  getSetCookies,
  setCookie
} = require('../..')
const { getHeadersList } = require('../../lib/cookies/util')

/* global Headers */

if (!globalThis.Headers) {
  skip('No global Headers to test')
  process.exit(0)
}

test('Using global Headers', (t) => {
  t.test('deleteCookies', (t) => {
    const headers = new Headers()

    t.equal(headers.get('set-cookie'), null)
    deleteCookie(headers, 'undici')
    t.equal(headers.get('set-cookie'), 'undici=; Expires=Thu, 01 Jan 1970 00:00:00 GMT')

    t.end()
  })

  t.test('getCookies', (t) => {
    const headers = new Headers({
      cookie: 'get=cookies; and=attributes'
    })

    t.same(getCookies(headers), { get: 'cookies', and: 'attributes' })
    t.end()
  })

  t.test('getSetCookies', (t) => {
    const headers = new Headers({
      'set-cookie': 'undici=getSetCookies; Secure'
    })

    const supportsCookies = getHeadersList(headers).cookies

    if (!supportsCookies) {
      t.same(getSetCookies(headers), [])
    } else {
      t.same(getSetCookies(headers), [
        {
          name: 'undici',
          value: 'getSetCookies',
          secure: true
        }
      ])
    }

    t.end()
  })

  t.test('setCookie', (t) => {
    const headers = new Headers()

    setCookie(headers, { name: 'undici', value: 'setCookie' })
    t.equal(headers.get('Set-Cookie'), 'undici=setCookie')
    t.end()
  })

  t.end()
})
