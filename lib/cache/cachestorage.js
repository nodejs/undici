'use strict'

const { kConstruct } = require('./symbols')
const { Cache, getCacheRequestResponseList } = require('./cache')
const { webidl } = require('../fetch/webidl')
const { kEnumerableProperty } = require('../core/util')

class CacheStorage {
  /**
   * @see https://w3c.github.io/ServiceWorker/#dfn-relevant-name-to-cache-map
   * @type {Map<string, import('./cache').requestResponseList}
   */
  #caches = new Map()

  constructor () {
    if (arguments[0] !== kConstruct) {
      webidl.illegalConstructor()
    }
  }

  async match (request, options = {}) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, { header: 'CacheStorage.match' })

    request = webidl.converters.RequestInfo(request)
    options = webidl.converters.CacheQueryOptions(options)
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#cache-storage-has
   * @param {string} cacheName
   * @returns {Promise<boolean>}
   */
  async has (cacheName) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, { header: 'CacheStorage.has' })

    cacheName = webidl.converters.DOMString(cacheName)

    // 2.1.1
    // 2.2
    return this.#caches.has(cacheName)
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#dom-cachestorage-open
   * @param {string} cacheName
   * @returns {Promise<Cache>}
   */
  async open (cacheName) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, { header: 'CacheStorage.open' })

    cacheName = webidl.converters.DOMString(cacheName)

    // 2.1
    if (this.#caches.has(cacheName)) {
      // await caches.open('v1') !== await caches.open('v1')

      // 2.1.1
      const cache = this.#caches.get(cacheName)
      const list = getCacheRequestResponseList(cache)

      // 2.1.1.1
      return new Cache(kConstruct, list)
    }

    // 2.2
    const cache = []

    // 2.3
    this.#caches.set(cacheName, cache)

    // 2.4
    return new Cache(kConstruct, cache)
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#cache-storage-delete
   * @param {string} cacheName
   * @returns {Promise<boolean>}
   */
  async delete (cacheName) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, { header: 'CacheStorage.delete' })

    cacheName = webidl.converters.DOMString(cacheName)

    // 1.
    // 2.
    const cacheExists = this.#caches.has(cacheName)

    // 2.1
    if (!cacheExists) {
      return false
    }

    // 2.3.1
    this.#caches.delete(cacheName)

    // 2.3.2
    return true
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#cache-storage-keys
   * @returns {string[]}
   */
  async keys () {
    webidl.brandCheck(this, CacheStorage)

    // 2.1
    const keys = this.#caches.keys()

    // 2.2
    return [...keys]
  }
}

Object.defineProperties(CacheStorage.prototype, {
  [Symbol.toStringTag]: {
    value: 'CacheStorage',
    configurable: true
  },
  match: kEnumerableProperty,
  has: kEnumerableProperty,
  open: kEnumerableProperty,
  delete: kEnumerableProperty,
  keys: kEnumerableProperty
})

module.exports = {
  CacheStorage
}
