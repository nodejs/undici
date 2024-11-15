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
  #maxSize = Infinity
  #maxEntrySize = Infinity

  #size = 0

  /**
   * @type {Map<string, Map<string, (GetResult & { body: Buffer[] | null })[]>>}
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

  get isFull () {
    return this.#arr.length >= this.#maxCount || this.#size >= this.#maxSize
  }

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} key
   * @returns {import('../../types/cache-interceptor.d.ts').default.GetResult | undefined}
   */
  get (key) {
    const values = this.#getValuesForRequest(key)
    const value = findValue(key, values)

    // TODO (perf): Faster with explicit props...
    return value != null ? { ...value } : undefined
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

    // TODO (fix): Deep clone...
    // TODO (perf): Faster with explicit props...
    key = { ...key }
    opts = { ...opts }

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

          store.#arr.push(value.body)
          for (const buf of body) {
            store.#size += buf.byteLength
          }

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
    // TODO (perf): This could be implemented more efficiently...

    // https://www.rfc-editor.org/rfc/rfc9111.html#section-2-3
    const topLevelKey = `${key.origin}:${key.path}`

    const cachedPaths = this.#map.get(topLevelKey)
    if (cachedPaths) {
      for (const values of cachedPaths.values()) {
        for (const value of values) {
          if (value.body) {
            for (const buf of value.body) {
              this.#size -= buf.byteLength
            }
            value.body = null
          }
        }
      }
      this.#arr = this.#arr.filter(value => value.body != null)
    }

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
      for (const buf of value.body) {
        this.#size -= buf.byteLength
      }
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
