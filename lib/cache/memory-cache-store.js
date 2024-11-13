'use strict'

const { Writable } = require('node:stream')

/**
 * @typedef {import('../../types/cache-interceptor.d.ts').default.CacheStore} CacheStore
 * @implements {CacheStore}
 *
 * @typedef {{
 *  locked: boolean
 *  opts: import('../../types/cache-interceptor.d.ts').default.CachedResponse
 *  body?: Buffer[]
 * }} MemoryStoreValue
 */
class MemoryCacheStore {
  #maxCount = Infinity

  #maxEntrySize = Infinity

  #entryCount = 0

  /**
   * @type {Map<string, Map<string, MemoryStoreValue[]>>}
   */
  #data = new Map()

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
    return this.#entryCount >= this.#maxCount
  }

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} key
   * @returns {import('../../types/cache-interceptor.d.ts').default.GetResult | undefined}
   */
  get (key) {
    if (typeof key !== 'object') {
      throw new TypeError(`expected key to be object, got ${typeof key}`)
    }

    const values = this.#getValuesForRequest(key, false)
    if (!values) {
      return undefined
    }

    const value = this.#findValue(key, values)

    if (!value || value.locked) {
      return undefined
    }

    return { ...value.opts, body: value.body }
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
      return undefined
    }

    const values = this.#getValuesForRequest(key, true)

    let value = this.#findValue(key, values)
    if (!value) {
      // The value doesn't already exist, meaning we haven't cached this
      //  response before. Let's assign it a value and insert it into our data
      //  property.

      if (this.isFull) {
        // Or not, we don't have space to add another response
        return undefined
      }

      if (this.#entryCount++ > this.#maxEntries) {
        this.#prune()
      }

      value = { locked: true, opts }
      values.push(value)
    } else {
      // Check if there's already another request writing to the value or
      //  a request reading from it
      if (value.locked) {
        return undefined
      }

      // Empty it so we can overwrite it
      value.body = []
    }

    let currentSize = 0
    /**
     * @type {Buffer[] | null}
     */
    let body = []
    const maxEntrySize = this.#maxEntrySize

    const writable = new Writable({
      write (chunk, encoding, callback) {
        if (key.method === 'HEAD') {
          throw new Error('HEAD request shouldn\'t have a body')
        }

        if (!body) {
          return callback()
        }

        if (typeof chunk === 'string') {
          chunk = Buffer.from(chunk, encoding)
        }

        currentSize += chunk.byteLength

        if (currentSize >= maxEntrySize) {
          body = null
          this.end()
          return callback()
        }

        body.push(chunk)
        callback()
      },
      final (callback) {
        value.locked = false
        if (body !== null) {
          value.body = body
        }

        callback()
      }
    })

    return writable
  }

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} key
   */
  delete (key) {
    this.#data.delete(`${key.origin}:${key.path}`)
  }

  /**
   * Gets all of the requests of the same origin, path, and method. Does not
   *  take the `vary` property into account.
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} key
   * @param {boolean} [makeIfDoesntExist=false]
   * @returns {MemoryStoreValue[] | undefined}
   */
  #getValuesForRequest (key, makeIfDoesntExist) {
    // https://www.rfc-editor.org/rfc/rfc9111.html#section-2-3
    const topLevelKey = `${key.origin}:${key.path}`
    let cachedPaths = this.#data.get(topLevelKey)
    if (!cachedPaths) {
      if (!makeIfDoesntExist) {
        return undefined
      }

      cachedPaths = new Map()
      this.#data.set(topLevelKey, cachedPaths)
    }

    let value = cachedPaths.get(key.method)
    if (!value && makeIfDoesntExist) {
      value = []
      cachedPaths.set(key.method, value)
    }

    return value
  }

  /**
   * Given a list of values of a certain request, this decides the best value
   *  to respond with.
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} req
   * @param {MemoryStoreValue[]} values
   * @returns {(MemoryStoreValue) | undefined}
   */
  #findValue (req, values) {
    const now = Date.now()
    return values.find(({ opts: { deleteAt, vary }, body }) => (
      body != null &&
      deleteAt > now &&
      (!vary || Object.keys(vary).every(key => vary[key] === req.headers?.[key]))
    ))
  }

  #prune () {
    const now = Date.now()
    for (const [key, cachedPaths] of this.#data) {
      for (const [method, prev] of cachedPaths) {
        const next = prev.filter(({ opts, body }) => body == null || opts.deleteAt > now)
        if (next.length === 0) {
          cachedPaths.delete(method)
          if (cachedPaths.size === 0) {
            this.#data.delete(key)
          }
        } else if (next.length !== prev.length) {
          this.#entryCount -= prev.length - next.length
          cachedPaths.set(method, next)
        }
      }
    }
  }
}

module.exports = MemoryCacheStore
