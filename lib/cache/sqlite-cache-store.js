'use strict'

const { DatabaseSync } = require('node:sqlite')
const { Writable } = require('stream')
const { assertCacheKey, assertCacheValue } = require('../util/cache.js')

const VERSION = 2

/**
 * @typedef {import('../../types/cache-interceptor.d.ts').default.CacheStore} CacheStore
 * @implements {CacheStore}
 *
 * @typedef {{
 *  id: Readonly<number>
 *  headers?: Record<string, string | string[]>
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
      CREATE TABLE IF NOT EXISTS cacheInterceptorV${VERSION} (
        -- Data specific to us
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        method TEXT NOT NULL,

        -- Data returned to the interceptor
        body TEXT NULL,
        deleteAt INTEGER NOT NULL,
        statusCode INTEGER NOT NULL,
        statusMessage TEXT NOT NULL,
        headers TEXT NULL,
        etag TEXT NULL,
        vary TEXT NULL,
        cachedAt INTEGER NOT NULL,
        staleAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cacheInterceptorV${VERSION}_url ON cacheInterceptorV${VERSION}(url);
      CREATE INDEX IF NOT EXISTS idx_cacheInterceptorV${VERSION}_method ON cacheInterceptorV${VERSION}(method);
      CREATE INDEX IF NOT EXISTS idx_cacheInterceptorV${VERSION}_deleteAt ON cacheInterceptorV${VERSION}(deleteAt);
    `)

    this.#getValuesQuery = this.#db.prepare(`
      SELECT
        id,
        body,
        deleteAt,
        statusCode,
        statusMessage,
        headers,
        etag,
        vary,
        cachedAt,
        staleAt
      FROM cacheInterceptorV${VERSION}
      WHERE
        url = ?
        AND method = ?
      ORDER BY
        deleteAt ASC
    `)

    this.#updateValueQuery = this.#db.prepare(`
      UPDATE cacheInterceptorV${VERSION} SET
        body = ?,
        deleteAt = ?,
        statusCode = ?,
        statusMessage = ?,
        headers = ?,
        etag = ?,
        cachedAt = ?,
        staleAt = ?,
        deleteAt = ?
      WHERE
        id = ?
    `)

    this.#insertValueQuery = this.#db.prepare(`
      INSERT INTO cacheInterceptorV${VERSION} (
        url,
        method,
        body,
        deleteAt,
        statusCode,
        statusMessage,
        headers,
        etag,
        vary,
        cachedAt,
        staleAt,
        deleteAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    this.#deleteByUrlQuery = this.#db.prepare(
      `DELETE FROM cacheInterceptorV${VERSION} WHERE url = ?`
    )

    this.#countEntriesQuery = this.#db.prepare(
      `SELECT COUNT(*) AS total FROM cacheInterceptorV${VERSION}`
    )

    this.#deleteExpiredValuesQuery = this.#db.prepare(
      `DELETE FROM cacheInterceptorV${VERSION} WHERE deleteAt <= ?`
    )

    this.#deleteOldValuesQuery = this.#maxCount === Infinity
      ? null
      : this.#db.prepare(`
        DELETE FROM cacheInterceptorV${VERSION}
        WHERE id IN (
          SELECT
            id
          FROM cacheInterceptorV${VERSION}
          ORDER BY cachedAt DESC
          LIMIT ?
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
      headers: value.headers ? JSON.parse(value.headers) : undefined,
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
    let size = 0
    /**
     * @type {Buffer[] | null}
     */
    const body = []
    const store = this

    return new Writable({
      write (chunk, encoding, callback) {
        if (typeof chunk === 'string') {
          chunk = Buffer.from(chunk, encoding)
        }

        size += chunk.byteLength

        if (size < store.#maxEntrySize) {
          body.push(chunk)
        } else {
          this.destroy()
        }

        callback()
      },
      final (callback) {
        const existingValue = store.#findValue(key, true)
        if (existingValue) {
          // Updating an existing response, let's overwrite it
          store.#updateValueQuery.run(
            JSON.stringify(stringifyBufferArray(body)),
            value.deleteAt,
            value.statusCode,
            value.statusMessage,
            value.headers ? JSON.stringify(value.headers) : null,
            value.etag ? value.etag : null,
            value.cachedAt,
            value.staleAt,
            value.deleteAt,
            existingValue.id
          )
        } else {
          store.#prune()
          // New response, let's insert it
          store.#insertValueQuery.run(
            url,
            key.method,
            JSON.stringify(stringifyBufferArray(body)),
            value.deleteAt,
            value.statusCode,
            value.statusMessage,
            value.headers ? JSON.stringify(value.headers) : null,
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

  #prune () {
    if (this.size <= this.#maxCount) {
      return 0
    }

    {
      const removed = this.#deleteExpiredValuesQuery.run(Date.now()).changes
      if (removed > 0) {
        return removed
      }
    }

    {
      const removed = this.#deleteOldValuesQuery.run(Math.max(Math.floor(this.#maxCount * 0.1), 1)).changes
      if (removed > 0) {
        return removed
      }
    }

    return 0
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
    const { headers, method } = key

    /**
     * @type {SqliteStoreValue[]}
     */
    const values = this.#getValuesQuery.all(url, method)

    if (values.length === 0) {
      return undefined
    }

    const now = Date.now()
    for (const value of values) {
      if (now >= value.deleteAt && !canBeExpired) {
        return undefined
      }

      let matches = true

      if (value.vary) {
        if (!headers) {
          return undefined
        }

        const vary = JSON.parse(value.vary)

        for (const header in vary) {
          if (!headerValueEquals(headers[header], vary[header])) {
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
 * @param {string|string[]|null|undefined} lhs
 * @param {string|string[]|null|undefined} rhs
 * @returns {boolean}
 */
function headerValueEquals (lhs, rhs) {
  if (Array.isArray(lhs) && Array.isArray(rhs)) {
    if (lhs.length !== rhs.length) {
      return false
    }

    for (let i = 0; i < lhs.length; i++) {
      if (rhs.includes(lhs[i])) {
        return false
      }
    }

    return true
  }

  return lhs === rhs
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
