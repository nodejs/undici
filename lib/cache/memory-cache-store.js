'use strict'

/**
 * @typedef {import('../../types/cache-interceptor.d.ts').default.CacheStore} CacheStore
 * @implements {CacheStore}
 */
class MemoryCacheStore {
  /**
   * @type {import('../../types/cache-interceptor.d.ts').default.MemoryCacheStoreOpts} opts
   */
  #opts = {}
  #entryCount = 0
  /**
   * @type {Map<string, import('../../types/cache-interceptor.d.ts').default.CacheStoreValue[]>}
   */
  #data = new Map()

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.MemoryCacheStoreOpts | undefined} opts
   */
  constructor (opts) {
    this.#opts = opts ?? {}

    if (!this.#opts.maxEntries) {
      this.#opts.maxEntries = Infinity
    }

    if (!this.#opts.maxEntrySize) {
      this.#opts.maxEntrySize = Infinity
    }
  }

  get entryCount () {
    return this.#entryCount
  }

  get maxEntries () {
    return this.#opts.maxEntries
  }

  get maxEntrySize () {
    return this.#opts.maxEntrySize
  }

  /**
   * @param {import('../../types/dispatcher.d.ts').default.RequestOptions} req
   * @returns {import('../../types/cache-interceptor.d.ts').default.CacheStoreValue | undefined}
   */
  get (req) {
    const key = this.#makeKey(req)
    if (!key) {
      return undefined
    }

    const values = this.#data.get(key)
    if (!values) {
      return
    }

    let value
    const now = Date.now()
    for (let i = values.length - 1; i >= 0; i--) {
      const current = values[i]
      if (now >= current.deleteAt) {
        // Should be deleted, so let's remove it
        values.splice(i, 1)
        this.#entryCount--
        continue
      }

      let matches = true

      if (current.vary) {
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

    return value
  }

  /**
   * @param {import('../../types/dispatcher.d.ts').default.RequestOptions} req
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheStoreValue} value
   */
  put (req, value) {
    const existingValue = this.get(req)
    if (existingValue) {
      // We already cached something with the same key & vary headers, override it
      Object.assign(existingValue, value)
    } else {
      // New response to cache
      const key = this.#makeKey(req)
      if (!key) {
        return
      }

      let values = this.#data.get(key)
      if (!values) {
        values = []
        this.#data.set(key, values)
      }

      this.#entryCount++
      values.push(value)
    }
  }

  /**
   * @param {import('../../types/dispatcher.d.ts').default.RequestOptions} req
   * @returns {string | undefined}
   */
  #makeKey (req) {
    // Can't cache if we don't have the origin
    if (!req.origin) {
      return undefined
    }

    // https://www.rfc-editor.org/rfc/rfc9111.html#section-2-3
    return `${req.origin}:${req.path}:${req.method}`
  }
}

module.exports = MemoryCacheStore
