'use strict'

const { createDeferredPromise } = require('../fetch/util')
const { queryCookies, setCookie, deleteCookie } = require('./util')
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

  /**
   * @description
   * Returns a promise resolving to the first in-scope script-visible value for a given cookie name (or other options).
   * @example
   * cookie = await cookieStore . get(name)
   * cookie = await cookieStore . get(options)
   * @param {string|import('../../types/cookie-store').CookieStoreGetOptions} name
   * @returns {Promise<import('../../types/cookie-store').CookieListItem>}
   */
  get (name = {}) {
    if (!(#cookieStore in this)) {
      throw new TypeError('Illegal invocation')
    } else if (arguments.length === 0) {
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

  /**
   * @description
   * Returns a promise resolving to the all in-scope script-visible value for a given cookie name (or other options).
   * @example
   * cookies = await cookieStore . getAll(name)
   * cookies = await cookieStore . getAll(options)
   * @param {string|import('../../types/cookie-store').CookieStoreGetOptions} name
   * @returns {Promise<import('../../types/cookie-store').CookieList>}
   */
  getAll (name = {}) {
    if (!(#cookieStore in this)) {
      throw new TypeError('Illegal invocation')
    }

    if (typeof name === 'object') {
      // 1. Let origin be the current settings object's origin.
      // 2. If origin is an opaque origin, then return a promise rejected with a "SecurityError" DOMException.
      // 3. Let url be the current settings object's creation URL.
      // 4. If options["url"] is present, then run these steps:

      // 5. Let p be a new promise.
      const p = createDeferredPromise()

      // 6. Run the following steps in parallel:

      // 1a. Let list be the results of running query cookies with url and options["name"] (if present).
      const list = queryCookies(this.#cookieStore, name.name)

      // 2a. If list is failure, then reject p with a TypeError.

      // 3a. Otherwise, resolve p with list.
      p.resolve(list)

      // 7. Return p.
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

      // 2a. If list is failure, then reject p with a TypeError.

      // 3a. Otherwise, resolve p with list.
      p.resolve(list)

      // 6. Return p.
      return p.promise
    }
  }

  /**
   * @description
   * Writes (creates or modifies) a cookie.
   *
   * The options default to:
   *
   * Path: /
   *
   * Domain: same as the domain of the current document or service worker’s location
   *
   * No expiry date
   *
   * SameSite: strict
   * @example
   * await cookieStore . set(name, value)
   * await cookieStore . set(options)
   * @param {string|import('../../types/cookie-store').CookieInit} name
   * @param {string?} value
   * @returns {Promise<void>}
   */
  set (name, value = undefined) {
    if (!(#cookieStore in this)) {
      throw new TypeError('Illegal invocation')
    } else if (arguments.length === 0) {
      throw new TypeError(
        `Failed to execute 'set' on 'CookieStore': 1 argument required, but only ${arguments.length} present.`
      )
    }

    if (typeof name === 'object') {
      // 1. Let origin be the current settings object's origin.
      // 2. If origin is an opaque origin, then return a promise rejected with a "SecurityError" DOMException.
      // 3. Let url be the current settings object's creation URL.

      // 4. Let p be a new promise.
      const p = createDeferredPromise()

      // 5. Run the following steps in parallel:

      // 1a. Let r be the result of running set a cookie with url, options["name"], options["value"],
      //    options["expires"], options["domain"], options["path"], and options["sameSite"].
      const r = setCookie(name)

      // 2a. If r is failure, then reject p with a TypeError and abort these steps.
      if (r === 'failure') {
        throw new TypeError(
          'Failed to execute \'set\' on \'CookieStore\': invalid cookie'
        )
      }

      // 3a. Resolve p with undefined.
      p.resolve(undefined)

      // 6. Return p.
      return p.promise
    } else {
      name = toUSVString(name)

      // 1. Let origin be the current settings object's origin.
      // 2. If origin is an opaque origin, then return a promise rejected with a "SecurityError" DOMException.
      // 3. Let url be the current settings object's creation URL.

      // 4. Let p be a new promise.
      const p = createDeferredPromise()

      // 5. Run the following steps in parallel:

      // 1a. Let r be the result of running set a cookie with url, name, value.
      const r = setCookie({ name, value })

      // 2a. If r is failure, then reject p with a TypeError and abort these steps.
      if (r === 'failure') {
        throw new TypeError(
          'Failed to execute \'set\' on \'CookieStore\': invalid cookie'
        )
      }

      // 3a. Resolve p with undefined.
      p.resolve(undefined)

      // 6. Return p.
      return p.promise
    }
  }

  /**
   * @description
   * Deletes (expires) a cookie with the given name or name and optional domain and path.
   * @example
   * await cookieStore . delete(name)
   * await cookieStore . delete(options)
   * @param {string|import('../../types/cookie-store').CookieStoreDeleteOptions} name
   * @returns {Promise<void>}
   */
  delete (name) {
    if (!(#cookieStore in this)) {
      throw new TypeError('Illegal invocation')
    } else if (arguments.length === 0) {
      throw new TypeError(
        'Failed to execute \'delete\' on \'CookieStore\': CookieStoreDeleteOptions must not be empty'
      )
    }

    // 1. Let origin be the current settings object's origin.
    // 2. If origin is an opaque origin, then return a promise rejected with a "SecurityError" DOMException.
    // 3. Let url be the current settings object's creation URL.

    // 4. Let p be a new promise.
    const p = createDeferredPromise()

    // 5. Run the following steps in parallel:

    // 1a. Let r be the result of running delete a cookie with url, name, null, "/", true, and "strict".
    deleteCookie(name, this.#cookieStore)

    // 2a. If r is failure, then reject p with a TypeError and abort these steps.

    // 3a. Resolve p with undefined.
    p.resolve(undefined)

    // 6. Return p.
    return p.promise
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
