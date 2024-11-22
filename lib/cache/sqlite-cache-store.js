'use strict'

const { DatabaseSync } = require('node:sqlite')
const { Writable } = require('stream')
const { assertCacheKey, assertCacheValue } = require('../util/cache.js')

/**
 * @typedef {import('../../types/cache-interceptor.d.ts').default.CacheStore} CacheStore
 * @implements {CacheStore}
 *
 * @typedef {{
 *  id: Readonly<number>
 *  rawHeaders?: string
 *  vary?: string | object
 *  body: string
 * } & import('../../types/cache-interceptor.d.ts').default.CacheValue} SqliteStoreValue
 */
class SqliteCacheStore {
  #maxEntrySize = Infinity
  #maxCount = Infinity

  /**
   * @type {import('node:sqlite').DatabaseSync}
   */
  #db

  /**
   * @type {import('node:sqlite').StatementSync}
   */
  #getValuesQuery

  /**
   * @type {import('node:sqlite').StatementSync}
   */
  #updateValueQuery

  /**
   * @type {import('node:sqlite').StatementSync}
   */
  #insertValueQuery

  /**
   * @type {import('node:sqlite').StatementSync}
   */
  #deleteExpiredValuesQuery

  /**
   * @type {import('node:sqlite').StatementSync}
   */
  #deleteByUrlQuery

  /**
   * @type {import('node:sqlite').StatementSync}
   */
  #countEntriesQuery

  /**
   * @type {import('node:sqlite').StatementSync}
   */
  #deleteOldValuesQuery

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.SqliteCacheStoreOpts | undefined} opts
   */
  constructor (opts) {
    if (opts) {
      if (typeof opts !== 'object') {
        throw new TypeError('SqliteCacheStore options must be an object')
      }

      if (opts.maxEntrySize !== undefined) {
        if (
          typeof opts.maxEntrySize !== 'number' ||
          !Number.isInteger(opts.maxEntrySize) ||
          opts.maxEntrySize < 0
        ) {
          throw new TypeError('SqliteCacheStore options.maxEntrySize must be a non-negative integer')
        }
        this.#maxEntrySize = opts.maxEntrySize
      }

      if (opts.maxCount !== undefined) {
        if (
          typeof opts.maxCount !== 'number' ||
          !Number.isInteger(opts.maxCount) ||
          opts.maxCount < 0
        ) {
          throw new TypeError('SqliteCacheStore options.maxCount must be a non-negative integer')
        }
        this.#maxCount = opts.maxCount
      }
    }

    this.#db = new DatabaseSync(opts?.location ?? ':memory:')

    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS cacheInterceptorV1 (
        -- Data specific to us
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        method TEXT NOT NULL,

        -- Data returned to the interceptor
        body TEXT NULL,
        deleteAt INTEGER NOT NULL,
        statusCode INTEGER NOT NULL,
        statusMessage TEXT NOT NULL,
        rawHeaders TEXT NULL,
        etag TEXT NULL,
        vary TEXT NULL,
        cachedAt INTEGER NOT NULL,
        staleAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cacheInterceptorV1_url ON cacheInterceptorV1(url);
      CREATE INDEX IF NOT EXISTS idx_cacheInterceptorV1_method ON cacheInterceptorV1(method);
      CREATE INDEX IF NOT EXISTS idx_cacheInterceptorV1_deleteAt ON cacheInterceptorV1(deleteAt);
    `)

    this.#getValuesQuery = this.#db.prepare(`
      SELECT
        id,
        body,
        deleteAt,
        statusCode,
        statusMessage,
        rawHeaders,
        etag,
        vary,
        cachedAt,
        staleAt
      FROM cacheInterceptorV1
      WHERE
        url = ?
        AND method = ?
      ORDER BY
        deleteAt ASC
    `)

    this.#updateValueQuery = this.#db.prepare(`
      UPDATE cacheInterceptorV1 SET
        body = ?,
        deleteAt = ?,
        statusCode = ?,
        statusMessage = ?,
        rawHeaders = ?,
        etag = ?,
        cachedAt = ?,
        staleAt = ?,
        deleteAt = ?
      WHERE
        id = ?
    `)

    this.#insertValueQuery = this.#db.prepare(`
      INSERT INTO cacheInterceptorV1 (
        url,
        method,
        body,
        deleteAt,
        statusCode,
        statusMessage,
        rawHeaders,
        etag,
        vary,
        cachedAt,
        staleAt,
        deleteAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    this.#deleteExpiredValuesQuery = this.#db.prepare(
      'DELETE FROM cacheInterceptorV1 WHERE deleteAt <= ?'
    )

    this.#deleteByUrlQuery = this.#db.prepare(
      'DELETE FROM cacheInterceptorV1 WHERE url = ?'
    )

    this.#countEntriesQuery = this.#db.prepare(
      'SELECT COUNT(*) AS total FROM cacheInterceptorV1'
    )

    const pruneLimit = this.#maxCount === Infinity
      ? 20
      : Math.max(Math.floor(this.#maxCount * 0.1), 1)

    this.#deleteOldValuesQuery = this.#db.prepare(`
      DELETE FROM cacheInterceptorV1
      WHERE id IN (
        SELECT
          id
        FROM cacheInterceptorV1
        ORDER BY cachedAt DESC
        LIMIT ${pruneLimit}
      )
    `)
  }

  close () {
    this.#db.close()
  }

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} key
   * @returns {import('../../types/cache-interceptor.d.ts').default.GetResult | undefined}
   */
  get (key) {
    assertCacheKey(key)

    const value = this.#findValue(key)

    if (!value) {
      return undefined
    }

    /**
     * @type {import('../../types/cache-interceptor.d.ts').default.GetResult}
     */
    const result = {
      body: value.body ? parseBufferArray(JSON.parse(value.body)) : null,
      statusCode: value.statusCode,
      statusMessage: value.statusMessage,
      rawHeaders: value.rawHeaders ? parseBufferArray(JSON.parse(value.rawHeaders)) : undefined,
      etag: value.etag ? value.etag : undefined,
      cachedAt: value.cachedAt,
      staleAt: value.staleAt,
      deleteAt: value.deleteAt
    }

    return result
  }

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} key
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheValue} value
   * @returns {Writable | undefined}
   */
  createWriteStream (key, value) {
    assertCacheKey(key)
    assertCacheValue(value)

    const url = this.#makeValueUrl(key)
    let currentSize = 0
    /**
     * @type {Buffer[] | null}
     */
    let body = key.method !== 'HEAD' ? [] : null
    const maxEntrySize = this.#maxEntrySize
    const findValue = this.#findValue.bind(this)
    const updateValueQuery = this.#updateValueQuery
    const insertValueQuery = this.#insertValueQuery

    this.prune()

    const writable = new Writable({
      write (chunk, encoding, callback) {
        if (typeof chunk === 'string') {
          chunk = Buffer.from(chunk, encoding)
        }

        currentSize += chunk.byteLength

        if (body) {
          if (currentSize >= maxEntrySize) {
            body = null
            this.end()
            return callback()
          }

          body.push(chunk)
        }

        callback()
      },
      final (callback) {
        if (body === null) {
          return callback()
        }

        /**
         * @type {SqliteStoreValue | undefined}
         */
        const existingValue = findValue(key, true)
        if (existingValue) {
          // Updating an existing response, let's delete it
          updateValueQuery.run(
            JSON.stringify(stringifyBufferArray(body)),
            value.deleteAt,
            value.statusCode,
            value.statusMessage,
            value.rawHeaders ? JSON.stringify(stringifyBufferArray(value.rawHeaders)) : null,
            value.etag,
            value.cachedAt,
            value.staleAt,
            value.deleteAt,
            existingValue.id
          )
        } else {
          // New response, let's insert it
          insertValueQuery.run(
            url,
            key.method,
            JSON.stringify(stringifyBufferArray(body)),
            value.deleteAt,
            value.statusCode,
            value.statusMessage,
            value.rawHeaders ? JSON.stringify(stringifyBufferArray(value.rawHeaders)) : null,
            value.etag ? value.etag : null,
            value.vary ? JSON.stringify(value.vary) : null,
            value.cachedAt,
            value.staleAt,
            value.deleteAt
          )
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
    if (typeof key !== 'object') {
      throw new TypeError(`expected key to be object, got ${typeof key}`)
    }

    this.#deleteByUrlQuery.run(this.#makeValueUrl(key))
  }

  /**
   * This method is called to prune the cache when it exceeds the maximum number
   * of entries. It removes half the entries in the cache, ordering them the oldest.
   *
   * @returns {Number} The number of entries removed
   */
  prune () {
    const total = this.size

    if (total <= this.#maxCount) {
      return
    }

    const res = this.#deleteOldValuesQuery.run()

    return res.changes
  }

  /**
   * Counts the number of rows in the cache
   * @returns {Number}
   */
  get size () {
    const { total } = this.#countEntriesQuery.get()
    return total
  }

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} key
   * @returns {string}
   */
  #makeValueUrl (key) {
    return `${key.origin}/${key.path}`
  }

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} key
   * @param {boolean} [canBeExpired=false]
   * @returns {(SqliteStoreValue & { vary?: Record<string, string[]> }) | undefined}
   */
  #findValue (key, canBeExpired = false) {
    const url = this.#makeValueUrl(key)

    /**
     * @type {SqliteStoreValue[]}
     */
    const values = this.#getValuesQuery.all(url, key.method)

    if (values.length === 0) {
      // No responses, let's just return early
      return undefined
    }

    const now = Date.now()
    for (const value of values) {
      if (now >= value.deleteAt && !canBeExpired) {
        this.#deleteExpiredValuesQuery.run(now)
        return undefined
      }

      let matches = true

      if (value.vary) {
        if (!key.headers) {
          // Request doesn't have headers so it can't fulfill the vary
          //  requirements no matter what, let's return early
          return undefined
        }

        value.vary = JSON.parse(value.vary)

        for (const header in value.vary) {
          if (key.headers[header] !== value.vary[header]) {
            matches = false
            break
          }
        }
      }

      if (matches) {
        return value
      }
    }

    return undefined
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
