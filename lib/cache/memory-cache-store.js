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
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} req
   * @returns {import('../../types/cache-interceptor.d.ts').default.GetResult | undefined}
   */
  get ({ origin, path, method, headers }) {
    const now = Date.now()

    const value = this.#arr.find((value) => (
      value.method === method &&
      value.origin === origin &&
      value.path === path &&
      value.deleteAt > now &&
      (!value.vary || Object.keys(value.vary).every(headerName => value.vary[headerName] === headers?.[headerName]))
    ))

    return value != null
      ? {
          statusMessage: value.statusMessage,
          statusCode: value.statusCode,
          rawHeaders: value.rawHeaders,
          cachedAt: value.cachedAt,
          staleAt: value.staleAt,
          body: value.body
        }
      : undefined
  }

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} req
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheValue} opts
   * @returns {Writable | undefined}
   */
  createWriteStream (req, opts) {
    if (typeof req !== 'object') {
      throw new TypeError(`expected key to be object, got ${typeof req}`)
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

    // TODO (fix): Deep clone...
    // TODO (perf): Faster with explicit props...
    const val = {
      statusCode: opts.statusCode,
      statusMessage: opts.statusMessage,
      rawHeaders: opts.rawHeaders,
      vary: opts.vary,
      cachedAt: opts.cachedAt,
      staleAt: opts.staleAt,
      deleteAt: opts.deleteAt,
      method: req.method,
      origin: req.origin,
      path: req.path,
      /** @type {Buffer[]} */
      body: []
    }

    return new Writable({
      write (chunk, encoding, callback) {
        if (typeof chunk === 'string') {
          chunk = Buffer.from(chunk, encoding)
        }

        currentSize += chunk.byteLength

        if (currentSize >= store.#maxEntrySize) {
          this.destroy()
        } else {
          val.body.push(chunk)
        }

        callback(null)
      },
      final (callback) {
        store.#arr.push(val)
        for (const buf of val.body) {
          store.#size += buf.byteLength
        }
        callback(null)
      }
    })
  }

  /**
   * @param {CacheKey} key
   */
  delete ({ origin, path }) {
    // https://www.rfc-editor.org/rfc/rfc9111.html#section-2-3
    const arr = []
    for (const value of this.#arr) {
      if (value.path === path && value.origin === origin) {
        for (const buf of value.body) {
          this.#size -= buf.byteLength
        }
      } else {
        arr.push(value)
      }
    }
    this.#arr = arr
  }

  #prune () {
    const count = Math.max(0, this.#arr.length - this.#maxCount / 2)
    for (const value of this.#arr.splice(0, count)) {
      for (const buf of value.body) {
        this.#size -= buf.byteLength
      }
    }
  }
}

module.exports = MemoryCacheStore
