'use strict'

const { createDeferredPromise } = require('../fetch/util')
const { kEnumerableProperty } = require('../core/util')
const { queryCookies, setCookie, deleteCookie, createCookieListItem } = require('./util')
const { parseSetCookie, parseUnparsedAttributes } = require('./parse')
const { CookieChangeEvent } = require('./cookie-change-event')
const { toUSVString, inspect } = require('util')
const { WriteStream } = require('tty')

const kCookieStoreConstructable = Symbol('CookieStore constructable')
const kCookieStore = Symbol('CookieStore')

class CookieStore extends EventTarget {
  [kCookieStore] = []

  constructor () {
    super()

    if (arguments[0] !== kCookieStoreConstructable) {
      throw new TypeError('Illegal invocation')
    }

    this[kCookieStore].push(...arguments[1])
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
    if (this == null || !(kCookieStore in this)) {
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
      const list = queryCookies(this[kCookieStore], name.name)

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
      const list = queryCookies(this[kCookieStore], name)

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
    if (this == null || !(kCookieStore in this)) {
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
      const list = queryCookies(this[kCookieStore], name.name)

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
      const list = queryCookies(this[kCookieStore], name)

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
    if (this == null || !(kCookieStore in this)) {
      throw new TypeError('Illegal invocation')
    } else if (arguments.length === 0) {
      throw new TypeError(
        `Failed to execute 'set' on 'CookieStore': 1 argument required, but only ${arguments.length} present.`
      )
    }

    const current = this[kCookieStore].find(
      c => c.cookieName === (name.name || name)
    )
    const currentIdx = current ? this[kCookieStore].indexOf(current) : -1

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

      if (currentIdx !== -1) {
        this[kCookieStore].splice(currentIdx, 1, r)
      } else {
        this[kCookieStore].push(r)
      }

      dispatchEvent(this, { changed: [r], deleted: [] })

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

      if (currentIdx !== -1) {
        this[kCookieStore].splice(currentIdx, 1, r)
      } else {
        this[kCookieStore].push(r)
      }

      dispatchEvent(this, { changed: [r], deleted: [] })

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
    if (this == null || !(kCookieStore in this)) {
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
    const r = deleteCookie(name, this[kCookieStore])

    dispatchEvent(this, { changed: [], deleted: [r] })

    // 2a. If r is failure, then reject p with a TypeError and abort these steps.

    // 3a. Resolve p with undefined.
    p.resolve(undefined)

    // 6. Return p.
    return p.promise
  }

  [Symbol.for('nodejs.util.inspect.custom')] () {
    const colors = WriteStream.prototype.hasColors()
    return `CookieStore ${inspect(this[kCookieStore], undefined, undefined, colors)}`
  }
}

Object.defineProperties(CookieStore.prototype, {
  get: kEnumerableProperty,
  getAll: kEnumerableProperty,
  set: kEnumerableProperty,
  delete: kEnumerableProperty,
  [Symbol.toStringTag]: {
    value: 'CookieStore',
    writable: false,
    enumerable: false,
    configurable: true
  }
})

/**
 * @description Create a cookie store from 1 or more `set-cookie` headers.
 * @param {(string|string[])?} cookies
 * @returns {CookieStore}
 */
function CookieStoreFrom (cookies) {
  const parsedList = []

  if (!Array.isArray(cookies)) {
    cookies = [cookies]
  }

  for (const cookie of cookies) {
    if (cookie === undefined) {
      continue
    } else if (typeof cookie !== 'string') {
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

/**
 * utility function to dispatch a CookieChangeEvent
 * @param {CookieStore} cookieStore
 * @param {{ deleted: [], changed: [] }} eventInitDict
 */
function dispatchEvent (cookieStore, eventInitDict) {
  const event = new CookieChangeEvent('change', {
    bubbles: false,
    cancelable: false,
    composed: false,
    changed: eventInitDict.changed.map(c => createCookieListItem(c)),
    deleted: eventInitDict.deleted.map(c => createCookieListItem(c))
  })

  cookieStore.dispatchEvent(event)
  if (typeof cookieStore.onchange === 'function') {
    cookieStore.onchange(event)
  }
}

module.exports = {
  CookieStore,
  CookieStoreFrom
}
