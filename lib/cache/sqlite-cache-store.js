'use strict'

const { env, execArgv } = require('node:process')

if (
  !(env.NODE_OPTIONS && env.NODE_OPTIONS.match(/experimental(-|_)sqlite/)) &&
  !execArgv.some(argv => argv.match(/experimental(-|_)sqlite/))
) {
  throw new Error('SqliteCacheStore needs the --experimental-sqlite flag enabled')
}

const { DatabaseSync } = require('node:sqlite')
const { Readable, Writable } = require('node:stream')

/**
 * @typedef {import('../../types/cache-interceptor.d.ts').default.CacheStore} CacheStore
 * @implements {CacheStore}
 *
 * @typedef {{
 *  id: readonly number
 *  opts: {
 *    rawHeaders?: Buffer[] | string
 *    rawTrailers?: string[] | string
 *  } | import('../../types/cache-interceptor.d.ts').default.CacheStoreValue
 *  body: Buffer[]
 * }} SqliteStoreValue
 *
 * @typedef {{
 *  id: readonly number
 *  origin: string
 *  method: string
 *  opts: string
 *  body: string | null
 *  deleteAt: number
 *  statusCode: number
 *  statusMessage: string
 *  rawHeaders: string
 *  rawTrailers: string[] | null
 *  vary: string | null
 *  cachedAt: number
 *  staleAt: number
 * }} CacheInterceptorRow
 */
class SqliteCacheStore {
  #maxEntries = Infinity

  #maxEntrySize = Infinity

  #entryCount = 0

  /**
   * @type {((err: Error) => void) | undefined}
   */
  #errorCallback

  #db = null

  #getValuesQuery

  #insertValueQuery

  #updateBodyQuery

  #deleteByIdStatement

  #deleteExpiredValuesStatement

  #deleteByOriginStatement

  /**
   * Ids of rows currently being written too and so can't be read from
   * @type {Set<number>}
   */
  #readLocks = new Set()

  /**
   * Denotes a row can't be written to because there's readables reading from it
   * Row id:number of readables open for that value
   * @type {Map<number, number>}
   */
  #writeLocks = new Map()

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.SqliteCacheStoreOpts | undefined} opts
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

      if (opts.errorCallback !== undefined) {
        if (typeof opts.errorCallback !== 'function') {
          throw new TypeError('MemoryCacheStore options.errorCallback must be a function')
        }
        this.#errorCallback = opts.errorCallback
      }
    }

    this.#db = new DatabaseSync(opts?.location ?? ':memory:')

    // Create the table and the indexes
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS cacheInterceptor (
        -- Things we care about
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        origin TEXT NOT NULL,
        method TEXT NOT NULL,
        body TEXT NULL,
        deleteAt INTEGER NOT NULL,

        -- Things the interceptor cares about
        statusCode INTEGER NOT NULL,
        statusMessage TEXT NOT NULL,
        rawHeaders TEXT NULL,
        rawTrailers TEXT NULL,
        vary TEXT NULL,
        cachedAt INTEGER NOT NULL,
        staleAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cacheInterceptor_origin ON cacheInterceptor(origin);
      CREATE INDEX IF NOT EXISTS idx_cacheInterceptor_method ON cacheInterceptor(method);
      CREATE INDEX IF NOT EXISTS idx_cacheInterceptor_deleteAt ON cacheInterceptor(deleteAt);
    `)

    this.#getValuesQuery = this.#db.prepare(`
      SELECT
        id,
        body,
        statusCode,
        statusMessage,
        rawHeaders,
        rawTrailers,
        vary,
        cachedAt,
        staleAt,
        deleteAt
      FROM cacheInterceptor
      WHERE 
        origin = ?
        AND method = ?
      ORDER BY
        deleteAt ASC
    `)

    this.#insertValueQuery = this.#db.prepare(`
      INSERT INTO cacheInterceptor (
        origin,
        method,
        deleteAt,
        statusCode,
        statusMessage,
        rawHeaders,
        rawTrailers,
        vary,
        cachedAt,
        staleAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    this.#updateBodyQuery = this.#db.prepare(
      'UPDATE cacheInterceptor SET body = ?, rawTrailers = ? WHERE id = ?'
    )

    this.#deleteByIdStatement = this.#db.prepare(
      'DELETE FROM cacheInterceptor WHERE id = ?'
    )

    this.#deleteExpiredValuesStatement = this.#db.prepare(
      'DELETE FROM cacheInterceptor WHERE deleteAt <= ?'
    )

    this.#deleteByOriginStatement = this.#db.prepare(
      'DELETE FROM cacheInterceptor WHERE origin = ? OR deleteAt <= ?'
    )
  }

  close () {
    this.#db.close()
  }

  get isFull () {
    return this.#entryCount >= this.#maxEntries
  }

  /**
   * @param {import('../../types/dispatcher.d.ts').default.RequestOptions} req
   * @returns {import('../../types/cache-interceptor.d.ts').default.CacheStoreReadable | undefined}
   */
  createReadStream (req) {
    if (!req.origin) {
      return undefined
    }

    if (typeof req !== 'object') {
      throw new TypeError(`expected req to be object, got ${typeof req}`)
    }

    const value = this.#findValue(req, true)

    if (!value || this.#readLocks.has(value.id)) {
      return undefined
    }

    // Lock it from being written too
    this.#writeLocks.set(value.id, (this.#writeLocks.get(value.id) ?? 0) + 1)

    const readable = new SqliteStoreReadableStream(value)

    readable.on('end', () => {
      const readerCount = this.#writeLocks.get(value.id) - 1

      if (readerCount === 0) {
        this.#writeLocks.delete(value.id)
      } else {
        this.#writeLocks.set(value.id, readerCount)
      }
    })

    return readable
  }

  /**
   * @param {import('../../types/dispatcher.d.ts').default.RequestOptions} req
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheStoreValue} opts
   */
  createWriteStream (req, opts) {
    if (!req.origin) {
      return undefined
    }

    if (typeof req !== 'object') {
      throw new TypeError(`expected req to be object, got ${typeof req}`)
    }

    if (typeof opts !== 'object') {
      throw new TypeError(`expected value to be object, got ${typeof opts}`)
    }

    let valueId

    const value = this.#findValue(req, false)
    if (!value) {
      // The value isn't already cached. Let's assign it a value and insert it
      //  into the db

      if (this.isFull) {
        // Or not, we're full. Let's see if we can purge any old responses
        const result = this.#deleteExpiredValuesStatement.run(Date.now())
        this.#entryCount -= result.changes

        if (this.isFull) {
          // We're still full
          return undefined
        }
      }

      this.#entryCount++

      const result = this.#insertValueQuery.run(
        req.origin + req.path,
        req.method,
        opts.deleteAt,
        opts.statusCode,
        opts.statusMessage,
        opts.rawHeaders
          ? JSON.stringify(stringifyBufferArray(opts.rawHeaders))
          : null,
        opts.rawTrailers ? JSON.stringify(opts.rawTrailers) : null,
        opts.vary ? JSON.stringify(opts.vary) : null,
        opts.cachedAt,
        opts.staleAt
      )

      valueId = result.lastInsertRowid
    } else {
      // Check if there's already another request writing to the value or
      //  a request reading from it
      if (this.#writeLocks.has(value.id) || this.#readLocks.has(value.id)) {
        return undefined
      }

      valueId = value.id
    }

    this.#readLocks.add(valueId)

    const writable = new SqliteStoreWritableStream(this.#maxEntrySize)

    let errored = false

    writable.on('close', () => {
      this.#readLocks.delete(valueId)

      if (!errored) {
        this.#updateBodyQuery.run(
          writable.body ? JSON.stringify(stringifyBufferArray(writable.body)) : null,
          writable.rawTrailers ? JSON.stringify(writable.rawTrailers) : null,
          valueId
        )
      }
    })

    // Remove the value if there was some error or the body was too big
    writable.on('error', (err) => {
      this.#deleteByIdStatement.run(valueId)
      this.#entryCount--
      errored = true

      if (this.#errorCallback !== undefined) {
        this.#errorCallback(err)
      }
    })

    writable.on('bodyOversized', () => {
      this.#deleteByIdStatement.run(valueId)
      this.#entryCount--
      errored = true
    })

    return writable
  }

  /**
   * @param {string} origin
   */
  deleteByOrigin (origin) {
    const result = this.#deleteByOriginStatement.run(origin)
    this.#entryCount -= result.changes
  }

  /**
   * @param {import('../../types/dispatcher.d.ts').default.RequestOptions} req
   * @param {boolean} parseJsonColumns
   * @returns {SqliteStoreValue}
   */
  #findValue (req, parseJsonColumns) {
    /**
     * @type {CacheInterceptorRow[]}
     */
    const values = this.#getValuesQuery.all(req.origin + req.path, req.method)

    // No responses, let's just return early
    if (values.length === 0) {
      return undefined
    }

    /**
     * @type {CacheInterceptorRow | undefined}
     */
    let matchingRow

    const now = Date.now()
    for (const value of values) {
      if (now >= value.deleteAt) {
        // Expired, let's skip
        return undefined
      }

      let matches = true

      if (value.vary !== null) {
        if (!req.headers) {
          // Request doesn't have headers so it can't fulfill this no matter
          //  what, let's return early
          return undefined
        }

        try {
          value.vary = JSON.parse(value.vary)
        } catch (err) {
          if (this.#errorCallback !== undefined) {
            this.#errorCallback(err)
          }
          return undefined
        }

        for (const key in value.vary) {
          if (req.headers[key] !== value.vary[key]) {
            matches = false
            break
          }
        }
      }

      if (matches) {
        matchingRow = value
        break
      }
    }

    if (!matchingRow) {
      return undefined
    }

    const value = {
      id: matchingRow.id,
      opts: {
        statusCode: matchingRow.statusCode,
        statusMessage: matchingRow.statusMessage,
        rawHeaders: matchingRow.rawHeaders,
        cachedAt: matchingRow.cachedAt,
        staleAt: matchingRow.staleAt,
        deleteAt: matchingRow.deleteAt
      },
      body: matchingRow.body ?? undefined
    }

    if (matchingRow.rawTrailers) {
      value.opts.rawTrailers = matchingRow.rawTrailers
    }

    if (matchingRow.vary) {
      value.opts.vary = matchingRow.vary
    }

    if (parseJsonColumns) {
      // Don't parse the vary header here because we already have

      if (value.opts.rawHeaders) {
        value.opts.rawHeaders = parseBufferArray(JSON.parse(value.opts.rawHeaders))
      }

      if (value.opts.rawTrailers) {
        value.opts.rawTrailers = JSON.parse(value.opts.rawTrailers)
      }

      if (value.body) {
        value.body = parseBufferArray(JSON.parse(matchingRow.body))
      }
    }

    return value
  }
}

class SqliteStoreReadableStream extends Readable {
  /**
   * @type {SqliteStoreValue}
   */
  #value
  /**
   * @type {Buffer[]}
   */
  #chunksToSend = []

  /**
   * @param {SqliteStoreValue} value
   */
  constructor (value) {
    super()

    this.#value = value
    this.#chunksToSend = [...this.#value.body, null]
  }

  get value () {
    return this.#value.opts
  }

  /**
   * @param {number} size
   */
  _read (size) {
    if (this.#chunksToSend.length === 0) {
      throw new Error('no chunks left to read, stream should have closed')
    }

    if (size > this.#chunksToSend.length) {
      size = this.#chunksToSend.length
    }

    for (let i = 0; i < size; i++) {
      this.push(this.#chunksToSend.shift())
    }
  }
}

class SqliteStoreWritableStream extends Writable {
  #currentSize = 0

  #maxEntrySize = 0

  /**
   * @type {Buffer[]}
   */
  #body = []

  /**
   * @type {string[] | undefined}
   */
  #rawTrailers = undefined

  #hasEmittedOversized = false

  /**
   * @param {number} maxEntrySize
   */
  constructor (maxEntrySize) {
    super()
    this.#maxEntrySize = maxEntrySize
  }

  get body () {
    return this.#body
  }

  get rawTrailers () {
    return this.#rawTrailers
  }

  /**
   * @param {string[] | undefined} trailers
   */
  set rawTrailers (trailers) {
    this.#rawTrailers = trailers
  }

  /**
   * @param {Buffer} chunk
   * @param {string} encoding
   * @param {() => void} callback
   */
  _write (chunk, encoding, callback) {
    if (typeof chunk === 'string') {
      chunk = Buffer.from(chunk, encoding)
    }

    this.#currentSize += chunk.byteLength
    if (this.#currentSize < this.#maxEntrySize) {
      this.#body.push(chunk)
    } else if (!this.#hasEmittedOversized) {
      this.#body = null // release memory as early as possible
      this.emit('bodyOversized')
      this.end()
    }

    callback()
  }

  _final (cb) {
    this.emit('close')
    cb()
  }
}

/**
 * @param {Buffer[]} buffers
 * @returns {string[]}
 */
function stringifyBufferArray (buffers) {
  const output = new Array(buffers.length)
  for (let i = 0; i < buffers.length; i++) {
    output[i] = buffers[i].toString()
  }

  return output
}

/**
 * @param {string[]} strings
 * @returns {Buffer[]}
 */
function parseBufferArray (strings) {
  const output = new Array(strings.length)

  for (let i = 0; i < strings.length; i++) {
    output[i] = Buffer.from(strings[i])
  }

  return output
}

module.exports = SqliteCacheStore
