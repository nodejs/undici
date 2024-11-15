'use strict'

const { Writable } = require('node:stream')

/**
 * @typedef {import('../../types/cache-interceptor.d.ts').default.CacheKey} CacheKey
 * @typedef {import('../../types/cache-interceptor.d.ts').default.CacheValue} CacheValue
 * @typedef {import('../../types/cache-interceptor.d.ts').default.CacheStore} CacheStore
 * @typedef {import('../../types/cache-interceptor.d.ts').default.GetResult} GetResult
 */

/**
 * @implements {CacheStore}
 */
class MemoryCacheStore {
  #maxCount = Infinity
  #maxSize = Infinity
  #maxEntrySize = Infinity

  #size = 0
  #entries = []

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.MemoryCacheStoreOpts | undefined} [opts]
   */
  constructor (opts) {
    if (opts) {
      if (typeof opts !== 'object') {
        throw new TypeError('MemoryCacheStore options must be an object')
      }

      if (opts.maxCount !== undefined) {
        if (
          typeof opts.maxCount !== 'number' ||
          !Number.isInteger(opts.maxCount) ||
          opts.maxCount < 0
        ) {
          throw new TypeError('MemoryCacheStore options.maxCount must be a non-negative integer')
        }
        this.#maxCount = opts.maxCount
      }

      if (opts.maxSize !== undefined) {
        if (
          typeof opts.maxSize !== 'number' ||
          !Number.isInteger(opts.maxSize) ||
          opts.maxSize < 0
        ) {
          throw new TypeError('MemoryCacheStore options.maxSize must be a non-negative integer')
        }
        this.#maxSize = opts.maxSize
      }

      if (opts.maxEntrySize !== undefined) {
        if (
          typeof opts.maxEntrySize !== 'number' ||
          !Number.isInteger(opts.maxEntrySize) ||
          opts.maxEntrySize < 0
        ) {
          throw new TypeError('MemoryCacheStore options.maxEntrySize must be a non-negative integer')
        }
        this.#maxEntrySize = opts.maxEntrySize
      }
    }
  }

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} req
   * @returns {import('../../types/cache-interceptor.d.ts').default.GetResult | undefined}
   */
  get (key) {
    if (typeof key !== 'object') {
      throw new TypeError(`expected key to be object, got ${typeof key}`)
    }

    const now = Date.now()
    return this.#entries.find((entry) => (
      entry.deleteAt > now &&
      entry.method === key.method &&
      entry.origin === key.origin &&
      entry.path === key.path &&
      (entry.vary == null || Object.keys(entry.vary).every(headerName => entry.vary[headerName] === key.headers?.[headerName]))
    ))
  }

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} key
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheValue} val
   * @returns {Writable | undefined}
   */
  createWriteStream (key, val) {
    if (typeof key !== 'object') {
      throw new TypeError(`expected key to be object, got ${typeof key}`)
    }
    if (typeof val !== 'object') {
      throw new TypeError(`expected value to be object, got ${typeof val}`)
    }

    const store = this
    const entry = { ...key, ...val, body: [], size: 0 }

    return new Writable({
      write (chunk, encoding, callback) {
        if (typeof chunk === 'string') {
          chunk = Buffer.from(chunk, encoding)
        }

        entry.size += chunk.byteLength

        if (entry.size >= store.#maxEntrySize) {
          this.destroy()
        } else {
          entry.body.push(chunk)
        }

        callback(null)
      },
      final (callback) {
        store.#entries.push(entry)
        store.#size += entry.size

        while (store.#entries.length >= store.#maxCount || store.#size >= store.#maxSize) {
          const count = Math.max(0, store.#entries.length - store.#maxCount / 2)
          for (const entry of store.#entries.splice(0, count)) {
            store.#size -= entry.size
          }
        }

        callback(null)
      }
    })
  }

  /**
   * @param {CacheKey} key
   */
  delete (key) {
    if (typeof key !== 'object') {
      throw new TypeError(`expected key to be object, got ${typeof key}`)
    }

    const arr = []
    for (const entry of this.#entries) {
      if (entry.path === key.path && entry.origin === key.origin) {
        this.#size -= entry.size
      } else {
        arr.push(entry)
      }
    }
    this.#entries = arr
  }
}

module.exports = MemoryCacheStore
