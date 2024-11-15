'use strict'

const { Writable } = require('node:stream')

/**
 * @typedef {import('../../types/cache-interceptor.d.ts').default.CacheKey} CacheKey
 * @typedef {import('../../types/cache-interceptor.d.ts').default.CacheStore} CacheStore
 * @typedef {import('../../types/cache-interceptor.d.ts').default.CachedResponse} CachedResponse
 * @typedef {import('../../types/cache-interceptor.d.ts').default.GetResult} GetResult
 */

/**
 * @implements {CacheStore}
 */
class MemoryCacheStore {
  #maxCount = Infinity
  #maxEntrySize = Infinity

  /**
   * @type {Map<string, Map<string, GetResult[]>>}
   */
  #map = new Map()
  #arr = []

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

  get isFull () {
    return this.#arr.length >= this.#maxCount
  }

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} key
   * @returns {import('../../types/cache-interceptor.d.ts').default.GetResult | undefined}
   */
  get (key) {
    const values = this.#getValuesForRequest(key)
    return findValue(key, values)
  }

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} key
   * @param {import('../../types/cache-interceptor.d.ts').default.CachedResponse} opts
   * @returns {Writable | undefined}
   */
  createWriteStream (key, opts) {
    if (typeof key !== 'object') {
      throw new TypeError(`expected key to be object, got ${typeof key}`)
    }
    if (typeof opts !== 'object') {
      throw new TypeError(`expected value to be object, got ${typeof opts}`)
    }

    if (this.isFull) {
      this.#prune()
    }

    if (this.isFull) {
      return undefined
    }

    let currentSize = 0

    const store = this
    const body = []

    return new Writable({
      write (chunk, encoding, callback) {
        if (typeof chunk === 'string') {
          chunk = Buffer.from(chunk, encoding)
        }

        currentSize += chunk.byteLength

        if (currentSize >= store.#maxEntrySize) {
          this.destroy()
        } else {
          body.push(chunk)
        }

        callback(null)
      },
      final (callback) {
        const values = store.#getValuesForRequest(key)

        let value = findValue(key, values)
        if (!value) {
          value = { ...opts, body }
          store.#arr.push(value)
          values.push(value)
        } else {
          Object.assign(value, opts, { body })
        }

        callback(null)
      }
    })
  }

  /**
   * @param {CacheKey} key
   */
  delete (key) {
    this.#map.delete(`${key.origin}:${key.path}`)
  }

  /**
   * Gets all of the requests of the same origin, path, and method. Does not
   *  take the `vary` property into account.
   * @param {CacheKey} key
   * @returns {GetResult[]}
   */
  #getValuesForRequest (key) {
    if (typeof key !== 'object') {
      throw new TypeError(`expected key to be object, got ${typeof key}`)
    }

    // https://www.rfc-editor.org/rfc/rfc9111.html#section-2-3
    const topLevelKey = `${key.origin}:${key.path}`

    let cachedPaths = this.#map.get(topLevelKey)
    if (!cachedPaths) {
      cachedPaths = new Map()
      this.#map.set(topLevelKey, cachedPaths)
    }

    let values = cachedPaths.get(key.method)
    if (!values) {
      values = []
      cachedPaths.set(key.method, values)
    }

    return values
  }

  #prune () {
    // TODO (perf): This could be implemented more efficiently...

    const count = Math.max(0, this.#arr.length - this.#maxCount / 2)
    for (const value of this.#arr.splice(0, count)) {
      value.body = null
    }

    for (const [key, cachedPaths] of this.#map) {
      for (const [method, prev] of cachedPaths) {
        const next = prev.filter(({ body }) => body == null)
        if (next.length === 0) {
          cachedPaths.delete(method)
          if (cachedPaths.size === 0) {
            this.#map.delete(key)
          }
        } else if (next.length !== prev.length) {
          cachedPaths.set(method, next)
        }
      }
    }
  }
}

/**
 * Given a list of values of a certain request, this decides the best value
 * to respond with.
 * @param {CacheKey} key
 * @param {GetResult[] | undefined } values
 * @returns {(GetResult) | undefined}
 */
function findValue (key, values) {
  if (typeof key !== 'object') {
    throw new TypeError(`expected key to be object, got ${typeof key}`)
  }

  const now = Date.now()
  return values?.find(({ deleteAt, vary, body }) => (
    body != null &&
    deleteAt > now &&
    (!vary || Object.keys(vary).every(headerName => vary[headerName] === key.headers?.[headerName]))
  ))
}

module.exports = MemoryCacheStore
