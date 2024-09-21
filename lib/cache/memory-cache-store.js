'use strict'

const EventEmitter = require('node:events')
const { Writable, Readable } = require('node:stream')

/**
 * @typedef {import('../../types/cache-interceptor.d.ts').default.CacheStore} CacheStore
 * @implements {CacheStore}
 *
 * @typedef {{
 *  complete: boolean
 *  value: import('../../types/cache-interceptor.d.ts').default.CacheStoreValue
 *  emitter: EventEmitter
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

    return value ? new MemoryStoreReadableStream(value) : undefined
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
      this.#entryCount++

      // TODO better name for this
      storedValue = {
        complete: false,
        value,
        emitter: new EventEmitter()
      }

      if (
        values.length === 0 ||
        value.deleteAt < values[values.length - 1].deleteAt
      ) {
        values.push(storedValue)
      } else if (value.deleteAt >= values[0].deleteAt) {
        values.unshift(storedValue)
      } else {
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
    }

    return new MemoryStoreWritableStream(storedValue)
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
  #chunksToSend

  /**
   * @param {MemoryStoreValue} value
   */
  constructor (value) {
    super()

    this.#value = value
    this.#chunksToSend = [...this.#value.value.body]

    if (value.complete) {
      this.#chunksToSend.push(null)
    } else {
      value.emitter.on('write', this.#chunksToSend.push)
      value.emitter.on('final', () => {
        this.#chunksToSend.push(null)
      })
    }
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

// TODO enforce max entry size, ...
class MemoryStoreWritableStream extends Writable {
  /**
   * @type {MemoryStoreValue}
   */
  #value

  /**
   * @param {MemoryCacheStore} value
   */
  constructor (value) {
    super()
    this.#value = value
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
  _write (chunk, _, callback) {
    this.#value.value.body.push(chunk)
    this.#value.emitter.emit('write', chunk)
    callback()
  }

  /**
   * @param {() => void} callback
   */
  _final (callback) {
    this.#value.complete = true
    this.#value.emitter.emit('final')

    callback()
  }

  /**
   * @param {Error} err
   * @param {() => void} callback
   */
  _destroy (err, callback) {
    if (err) {
      this.#value.emitter.emit('error', err)
    }
    callback(err)
  }
}

module.exports = MemoryCacheStore
