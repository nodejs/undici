'use strict'

const { createDeferredPromise } = require('../fetch/util')
const { queryCookies } = require('./util')
const { parseSetCookie, parseUnparsedAttributes } = require('./parse')
const { toUSVString } = require('util')

const kCookieStoreConstructable = Symbol('CookieStore constructable')

class CookieStore {
  #cookieStore = []

  constructor () {
    if (arguments[0] !== kCookieStoreConstructable) {
      throw new TypeError('Illegal invocation')
    }

    this.#cookieStore.push(...arguments[1])
  }

  get (name) {
    if (name === undefined || arguments.length === 0) {
      throw new TypeError(
        'Failed to execute \'get\' on \'CookieStore\': CookieStoreGetOptions must not be empty'
      )
    }

    if (typeof name === 'object') {
      // 1. Let origin be the current settings object's origin.
      // 2. If origin is an opaque origin, then return a promise rejected with a "SecurityError" DOMException.
      // 3. Let url be the current settings object's creation URL.

      // 4. If options is empty, then return a promise rejected with a TypeError.
      if (name === null || Object.keys(name).length === 0) {
        return Promise.reject(
          new TypeError(
            'Failed to execute \'get\' on \'CookieStore\': CookieStoreGetOptions must not be empty'
          )
        )
      }

      // 5. If options["url"] is present, then run these steps:
      // Note: there's still no concept of origin in Node, so these steps are skipped

      // 6. Let p be a new promise.
      const p = createDeferredPromise()

      // 7. Run the following steps in parallel:

      // 1a. Let list be the results of running query cookies with url and options["name"] (if present).
      const list = queryCookies(this.#cookieStore, name.name)

      // 2a. If list is failure, then reject p with a TypeError and abort these steps.

      // 3a. If list is empty, then resolve p with undefined.
      // 4a. Otherwise, resolve p with the first item of list.
      p.resolve(list[0])

      // 8. Return p.
      return p.promise
    } else {
      name = toUSVString(name)

      // 1. Let origin be the current settings object's origin.
      // 2. If origin is an opaque origin, then return a promise rejected with a "SecurityError" DOMException.
      // 3. Let url be the current settings object's creation URL.

      // 4. Let p be a new promise.
      const p = createDeferredPromise()

      // 5. Run the following steps in parallel:

      // 1a. Let list be the results of running query cookies with url and name.
      const list = queryCookies(this.#cookieStore, name)

      // 2a. If list is failure, then reject p with a TypeError and abort these steps.

      // 3a. If list is empty, then resolve p with undefined.
      // 4a. Otherwise, resolve p with the first item of list.
      p.resolve(list[0])

      // 6. Return p.
      return p.promise
    }
  }
}

/**
 * @description Create a cookie store from 1 or more `set-cookie` headers.
 * @param {string|string[]} cookies
 * @returns {CookieStore}
 */
function CookieStoreFrom (cookies) {
  const parsedList = []

  if (!Array.isArray(cookies)) {
    cookies = [cookies]
  }

  for (const cookie of cookies) {
    if (typeof cookie !== 'string') {
      throw new TypeError(`Expected string, but got ${cookie}`)
    }

    const nameValuePair = parseSetCookie(cookie)
    const attributes = parseUnparsedAttributes(nameValuePair.unparsedAttributes)

    parsedList.push({
      cookieName: nameValuePair.cookieName,
      cookieValue: nameValuePair.cookieValue,
      ...attributes
    })
  }

  return new CookieStore(kCookieStoreConstructable, parsedList)
}

module.exports = {
  CookieStore,
  CookieStoreFrom
}
