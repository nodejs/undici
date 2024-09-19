'use strict'

/**
 * @typedef {import('../../types/cache-interceptor.d.ts').default.CacheStore} CacheStore
 * @implements {CacheStore}
 */
class MemoryCacheStore {
  #maxEntries = Infinity

  #maxEntrySize = Infinity

  #entryCount = 0
  /**
   * @type {Map<string, Map<string, import('../../types/cache-interceptor.d.ts').default.CacheStoreValue[]>>}
   */
  #data = new Map()

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.MemoryCacheStoreOpts | undefined} opts
   */
  constructor (opts) {
    if (opts) {
      if (typeof opts !== 'object') {
        throw new TypeError('MemoryCacheStore options must be an object')
      }

      if (opts.maxEntries !== undefined) {
        if (
          typeof opts.maxEntries !== 'number' ||
          !Number.isInteger(opts.maxEntries) ||
          opts.maxEntries < 0
        ) {
          throw new TypeError('MemoryCacheStore options.maxEntries must be a non-negative integer')
        }
        this.#maxEntries = opts.maxEntries
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

  get entryCount () {
    return this.#entryCount
  }

  get maxEntries () {
    return this.#maxEntries
  }

  get maxEntrySize () {
    return this.#maxEntrySize
  }

  /**
   * @param {import('../../types/dispatcher.d.ts').default.RequestOptions} req
   * @returns {import('../../types/cache-interceptor.d.ts').default.CacheStoreValue | undefined}
   */
  get (req) {
    const values = this.#getValues(req)
    if (!values) {
      return
    }

    let value
    const now = Date.now()
    for (let i = values.length - 1; i >= 0; i--) {
      const current = values[i]
      if (now >= current.deleteAt) {
        // We've reached expired values, let's delete them
        this.#entryCount -= values.length - i
        values.length = i
        break
      }

      let matches = true

      if (current.vary) {
        if (!req.headers) {
          matches = false
          break
        }

        for (const key in current.vary) {
          if (current.vary[key] !== req.headers[key]) {
            matches = false
            break
          }
        }
      }

      if (matches) {
        value = current
        break
      }
    }

    return value ? { ...value } : undefined
  }

  /**
   * @param {import('../../types/dispatcher.d.ts').default.RequestOptions} req
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheStoreValue} value
   */
  put (req, value) {
    const existingValue = this.get(req)
    if (existingValue) {
      // We already cached something with the same key & vary headers, update it
      Object.assign(existingValue, value)
      return
    }

    // New response to cache
    const values = this.#getValues(req)

    this.#entryCount++

    if (!values) {
      // We've never cached anything at this origin before
      const pathValues = new Map()
      pathValues.set(`${req.path}:${req.method}`, [value])

      this.#data.set(req.origin, pathValues)
      return
    }

    if (
      values.length === 0 ||
      value.deleteAt < values[values.length - 1].deleteAt
    ) {
      values.push(value)
    }

    if (value.deleteAt >= values[0].deleteAt) {
      values.unshift(value)
      return
    }

    let startIndex = 0
    let endIndex = values.length
    while (true) {
      if (startIndex === endIndex) {
        values.splice(startIndex, 0, value)
        break
      }

      const middleIndex = (startIndex + endIndex) / 2
      const middleValue = values[middleIndex]
      if (value.deleteAt === middleIndex) {
        values.splice(middleIndex, 0, value)
        break
      } else if (value.deleteAt > middleValue.deleteAt) {
        endIndex = middleIndex
        continue
      } else {
        startIndex = middleIndex
        continue
      }
    }
  }

  /**
   * @param {string} origin
   */
  deleteByOrigin (origin) {
    this.#data.delete(origin)
  }

  /**
   * @param {import('../../types/dispatcher.d.ts').default.RequestOptions} req
   * @returns {import('../../types/cache-interceptor.d.ts').default.CacheStoreValue[] | undefined}
   */
  #getValues (req) {
    // https://www.rfc-editor.org/rfc/rfc9111.html#section-2-3
    const cachedPaths = this.#data.get(req.origin)
    if (!cachedPaths) {
      return undefined
    }

    return cachedPaths.get(`${req.path}:${req.method}`)
  }
}

module.exports = MemoryCacheStore
