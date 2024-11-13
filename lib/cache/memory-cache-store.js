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

    /**
     * @type {(MemoryStoreValue & { index: number }) | undefined}
     */
    let value = this.#findValue(key, values)
    let valueIndex = value?.index
    if (!value) {
      // The value doesn't already exist, meaning we haven't cached this
      //  response before. Let's assign it a value and insert it into our data
      //  property.

      if (this.isFull) {
        // Or not, we don't have space to add another response
        return undefined
      }

      this.#entryCount++

      value = {
        locked: true,
        opts
      }

      // We want to sort our responses in decending order by their deleteAt
      //  timestamps so that deleting expired responses is faster
      if (
        values.length === 0 ||
        opts.deleteAt < values[values.length - 1].deleteAt
      ) {
        // Our value is either the only response for this path or our deleteAt
        //  time is sooner than all the other responses
        values.push(value)
        valueIndex = values.length - 1
      } else if (opts.deleteAt >= values[0].deleteAt) {
        // Our deleteAt is later than everyone elses
        values.unshift(value)
        valueIndex = 0
      } else {
        // We're neither in the front or the end, let's just binary search to
        //  find our stop we need to be in
        let startIndex = 0
        let endIndex = values.length
        while (true) {
          if (startIndex === endIndex) {
            values.splice(startIndex, 0, value)
            break
          }

          const middleIndex = Math.floor((startIndex + endIndex) / 2)
          const middleValue = values[middleIndex]
          if (opts.deleteAt === middleIndex) {
            values.splice(middleIndex, 0, value)
            valueIndex = middleIndex
            break
          } else if (opts.deleteAt > middleValue.opts.deleteAt) {
            endIndex = middleIndex
            continue
          } else {
            startIndex = middleIndex
            continue
          }
        }
      }
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
    let body = key.method !== 'HEAD' ? [] : null
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
          shiftAtIndex(values, valueIndex)
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
   * @returns {(MemoryStoreValue & { index: number }) | undefined}
   */
  #findValue (req, values) {
    /**
     * @type {MemoryStoreValue | undefined}
     */
    let value
    const now = Date.now()
    for (let i = values.length - 1; i >= 0; i--) {
      const current = values[i]
      const currentCacheValue = current.opts
      if (now >= currentCacheValue.deleteAt) {
        // We've reached expired values, let's delete them
        this.#entryCount -= values.length - i
        values.length = i
        break
      }

      let matches = true

      if (currentCacheValue.vary) {
        if (!req.headers) {
          matches = false
          break
        }

        for (const key in currentCacheValue.vary) {
          if (currentCacheValue.vary[key] !== req.headers[key]) {
            matches = false
            break
          }
        }
      }

      if (matches) {
        value = {
          ...current,
          index: i
        }
        break
      }
    }

    return value
  }
}

/**
 * @param {any[]} array Array to modify
 * @param {number} idx Index to delete
 */
function shiftAtIndex (array, idx) {
  for (let i = idx + 1; idx < array.length; i++) {
    array[i - 1] = array[i]
  }

  array.length--
}

module.exports = MemoryCacheStore
