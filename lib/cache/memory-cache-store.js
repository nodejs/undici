'use strict'

const { Writable, Readable } = require('node:stream')

/**
 * @typedef {import('../../types/cache-interceptor.d.ts').default.CacheStore} CacheStore
 * @implements {CacheStore}
 *
 * @typedef {{
 *  complete: boolean
 *  readers: number
 *  readLock: boolean
 *  writeLock: boolean
 *  value: import('../../types/cache-interceptor.d.ts').default.CacheStoreValue
 *  body: Buffer[]
 * }} MemoryStoreValue
 */
class MemoryCacheStore {
  #maxEntries = Infinity

  #maxEntrySize = Infinity

  #entryCount = 0

  /**
   * @type {Map<string, Map<string, MemoryStoreValue>>}
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

  get isFull () {
    return this.#entryCount >= this.#maxEntries
  }

  createReadStream (req) {
    if (typeof req !== 'object') {
      throw new TypeError(`expected req to be object, got ${typeof req}`)
    }

    const values = this.#getValuesForRequest(req, false)
    if (!values) {
      return undefined
    }

    const value = this.#findValue(req, values)

    if (!value || value.readLock) {
      return undefined
    }

    return new MemoryStoreReadableStream(value)
  }

  createWriteStream (req, value) {
    if (typeof req !== 'object') {
      throw new TypeError(`expected req to be object, got ${typeof req}`)
    }
    if (typeof value !== 'object') {
      throw new TypeError(`expected value to be object, got ${typeof value}`)
    }

    if (this.isFull) {
      return undefined
    }

    const values = this.#getValuesForRequest(req, true)

    let storedValue = this.#findValue(req, values)
    if (!storedValue) {
      // The value doesn't already exist, meaning we haven't cached this
      //  response before. Let's assign it a value and insert it into our data
      //  property.

      if (this.#entryCount >= this.#maxEntries) {
        // Or not, we don't have space to add another response
        return undefined
      }

      this.#entryCount++

      // TODO better name for this
      storedValue = {
        readLock: false,
        readers: 0,
        writeLock: false,
        value,
        body: []
      }

      // We want to sort our responses in decending order by their deleteAt
      //  timestamps so that deleting expired responses is faster
      if (
        values.length === 0 ||
        value.deleteAt < values[values.length - 1].deleteAt
      ) {
        // Our value is either the only response for this path or our deleteAt
        //  time is sooner than all the other responses
        values.push(storedValue)
      } else if (value.deleteAt >= values[0].deleteAt) {
        // Our deleteAt is later than everyone elses
        values.unshift(storedValue)
      } else {
        // We're neither in the front or the end, let's just binary search to
        //  find our stop we need to be in
        let startIndex = 0
        let endIndex = values.length
        while (true) {
          if (startIndex === endIndex) {
            values.splice(startIndex, 0, storedValue)
            break
          }

          const middleIndex = Math.floor((startIndex + endIndex) / 2)
          const middleValue = values[middleIndex]
          if (value.deleteAt === middleIndex) {
            values.splice(middleIndex, 0, storedValue)
            break
          } else if (value.deleteAt > middleValue.value.deleteAt) {
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
      if (storedValue.writeLock || storedValue.readLock) {
        return undefined
      }

      // Empty it so we can overwrite it
      storedValue.body = []
    }

    const writable = new MemoryStoreWritableStream(
      storedValue,
      this.#maxEntrySize
    )

    // Remove the value if there was some error
    writable.on('error', () => {
      values.filter(value => value !== storedValue)
    })

    return writable
  }

  /**
   * @param {string} origin
   */
  deleteByOrigin (origin) {
    this.#data.delete(origin)
  }

  /**
   * Gets all of the requests of the same origin, path, and method. Does not
   *  take the `vary` property into account.
   * @param {import('../../types/dispatcher.d.ts').default.RequestOptions} req
   * @returns {MemoryStoreValue[] | undefined}
   */
  #getValuesForRequest (req, makeIfDoesntExist) {
    // https://www.rfc-editor.org/rfc/rfc9111.html#section-2-3
    let cachedPaths = this.#data.get(req.origin)
    if (!cachedPaths) {
      if (!makeIfDoesntExist) {
        return undefined
      }

      cachedPaths = new Map()
      this.#data.set(req.origin, cachedPaths)
    }

    let values = cachedPaths.get(`${req.path}:${req.method}`)
    if (!values && makeIfDoesntExist) {
      values = []
      cachedPaths.set(`${req.path}:${req.method}`, values)
    }

    return values
  }

  /**
   * Given a list of values of a certain request, this decides the best value
   *  to respond with.
   * @param {import('../../types/dispatcher.d.ts').default.RequestOptions} req
   * @param {MemoryStoreValue[]} values
   * @returns {MemoryStoreValue | undefined}
   */
  #findValue (req, values) {
    /**
     * @type {MemoryStoreValue}
     */
    let value
    const now = Date.now()
    for (let i = values.length - 1; i >= 0; i--) {
      const current = values[i]
      const currentCacheValue = current.value
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
        value = current
        break
      }
    }

    return value
  }
}

class MemoryStoreReadableStream extends Readable {
  /**
   * @type {MemoryStoreValue}
   */
  #value
  /**
   * @type {Buffer[]}
   */
  #chunksToSend = []

  /**
   * @param {MemoryStoreValue} value
   */
  constructor (value) {
    super()

    if (value.readLock) {
      throw new Error('can\'t read a locked value')
    }

    this.#value = value
    this.#chunksToSend = [...this.#value.body, null]

    this.#value.readers++
    this.#value.writeLock = true

    this.on('close', () => {
      this.#value.readers--

      if (this.#value.readers === 0) {
        this.#value.writeLock = false
      }
    })
  }

  get value () {
    return this.#value.value
  }

  /**
   * @param {number} size
   */
  _read (size) {
    if (this.#chunksToSend.length === 0) {
      return
    }

    if (size > this.#chunksToSend.length) {
      size = this.#chunksToSend.length
    }

    for (let i = 0; i < size; i++) {
      this.push(this.#chunksToSend.shift())
    }
  }
}

class MemoryStoreWritableStream extends Writable {
  /**
   * @type {MemoryStoreValue}
   */
  #value
  #currentSize = 0
  #maxEntrySize = 0
  /**
   * @type {Buffer[]}
   */
  #body = []

  /**
   * @param {MemoryCacheStore} value
   * @param {number} maxEntrySize
   */
  constructor (value, maxEntrySize) {
    super()
    this.#value = value
    this.#value.readLock = true
    this.#maxEntrySize = maxEntrySize
  }

  get rawTrailers () {
    return this.#value.value.rawTrailers
  }

  /**
   * @param {Buffer[] | undefined} trailers
   */
  set rawTrailers (trailers) {
    this.#value.value.rawTrailers = trailers
  }

  /**
   * @param {Buffer} chunk
   * @param {*} _
   * @param {() => void} callback
   */
  _write (chunk, encoding, callback) {
    if (typeof chunk === 'string') {
      chunk = Buffer.from(chunk, encoding)
    }

    this.#currentSize += chunk.byteLength
    if (this.#currentSize < this.#maxEntrySize) {
      this.#body.push(chunk)
    } else {
      this.#body = null // release memory as early as possible
    }

    callback()
  }

  /**
   * @param {() => void} callback
   */
  _final (callback) {
    if (this.#currentSize < this.#maxEntrySize) {
      this.#value.complete = true
      this.#value.readLock = false
      this.#value.body = this.#body
    }

    callback()
  }
}

module.exports = MemoryCacheStore
