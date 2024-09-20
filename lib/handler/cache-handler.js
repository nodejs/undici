'use strict'

const util = require('../core/util')
const DecoratorHandler = require('../handler/decorator-handler')
const { parseCacheControlHeader, parseVaryHeader, UNSAFE_METHODS } = require('../util/cache')

/**
 * Writes a response to a CacheStore and then passes it on to the next handler
 */
class CacheHandler extends DecoratorHandler {
  /**
   * @type {import('../../types/cache-interceptor.d.ts').default.CacheOptions} | null
   */
  #opts = null
  /**
   * @type {import('../../types/dispatcher.d.ts').default.RequestOptions | null}
   */
  #req = null
  /**
   * @type {import('../../types/dispatcher.d.ts').default.DispatchHandlers | null}
   */
  #handler = null
  /**
   * @type {import('../../types/cache-interceptor.d.ts').default.CacheStoreWriteable | undefined}
   */
  #writeStream

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheOptions} opts
   * @param {import('../../types/dispatcher.d.ts').default.RequestOptions} req
   * @param {import('../../types/dispatcher.d.ts').default.DispatchHandlers} handler
   */
  constructor (opts, req, handler) {
    super(handler)

    this.#opts = opts
    this.#req = req
    this.#handler = handler
  }

  /**
   * @see {DispatchHandlers.onHeaders}
   *
   * @param {number} statusCode
   * @param {Buffer[]} rawHeaders
   * @param {() => void} resume
   * @param {string} statusMessage
   * @param {Record<string, string | string[]> | undefined} headers
   * @returns {boolean}
   */
  onHeaders (
    statusCode,
    rawHeaders,
    resume,
    statusMessage,
    headers = util.parseHeaders(rawHeaders)
  ) {
    if (
      this.#req.method in UNSAFE_METHODS &&
      statusCode >= 200 &&
      statusCode <= 399
    ) {
      // https://www.rfc-editor.org/rfc/rfc9111.html#name-invalidating-stored-respons
      const result = this.#opts.store.deleteByOrigin(this.#req.origin)
      if (
        result &&
        typeof result.catch === 'function' &&
        typeof this.#handler.onError === 'function'
      ) {
        result.catch(this.#handler.onError)
      }

      return this.#handler.onHeaders(
        statusCode,
        rawHeaders,
        resume,
        statusMessage,
        headers
      )
    }

    const cacheControlHeader = headers['cache-control']
    const contentLengthHeader = headers['content-length']

    if (!cacheControlHeader || !contentLengthHeader) {
      // Don't have the headers we need, can't cache
      return this.#handler.onHeaders(
        statusCode,
        rawHeaders,
        resume,
        statusMessage,
        headers
      )
    }

    const contentLength = Number(headers['content-length'])
    const currentSize =
      this.#getSizeOfBuffers(rawHeaders) + (statusMessage?.length ?? 0) + 64
    if (
      !Number.isInteger(contentLength) ||
      this.#opts.store.isFull() ||
      this.#opts.store.entryCount >= this.#opts.store.maxEntries
    ) {
      return this.#handler.onHeaders(
        statusCode,
        rawHeaders,
        resume,
        statusMessage,
        headers
      )
    }

    const cacheControlDirectives = parseCacheControlHeader(cacheControlHeader)
    if (!canCacheResponse(statusCode, headers, cacheControlDirectives)) {
      return this.#handler.onHeaders(
        statusCode,
        rawHeaders,
        resume,
        statusMessage,
        headers
      )
    }

    const now = Date.now()
    const staleAt = determineStaleAt(headers, cacheControlDirectives)
    if (staleAt) {
      const varyDirectives = headers.vary
        ? parseVaryHeader(headers.vary, this.#req.headers)
        : undefined
      const deleteAt = determineDeleteAt(cacheControlDirectives, staleAt)

      const strippedHeaders = stripNecessaryHeaders(
        rawHeaders,
        headers,
        cacheControlDirectives
      )

      this.#writeStream = this.#opts.store.createWriteStream(this.#req, {
        statusCode,
        statusMessage,
        rawHeaders: strippedHeaders,
        body: [],
        vary: varyDirectives,
        size: currentSize,
        cachedAt: now,
        staleAt: now + staleAt,
        deleteAt: now + deleteAt
      })

      this.#writeStream.on('drain', resume)
      this.#writeStream.on('error', () => {
        // TODO just pass to the #handler.onError maybe?
      })
    }

    if (typeof this.#handler.onHeaders === 'function') {
      return this.#handler.onHeaders(
        statusCode,
        rawHeaders,
        resume,
        statusMessage,
        headers
      )
    }
  }

  /**
   * @see {DispatchHandlers.onData}
   *
   * @param {Buffer} chunk
   * @returns {boolean}
   */
  onData (chunk) {
    if (this.#writeStream) {
      this.#writeStream.write(chunk)
    }

    if (typeof this.#handler.onData === 'function') {
      return this.#handler.onData(chunk)
    }
  }

  /**
   * @see {DispatchHandlers.onComplete}
   *
   * @param {string[] | null} rawTrailers
   */
  onComplete (rawTrailers) {
    if (this.#writeStream) {
      if (rawTrailers) {
        this.#writeStream.rawTrailers = rawTrailers
      }

      this.#writeStream.end()
    }

    if (typeof this.#handler.onComplete === 'function') {
      return this.#handler.onComplete(rawTrailers)
    }
  }

  /**
   * @see {DispatchHandlers.onError}
   *
   * @param {Error} err
   */
  onError (err) {
    if (this.#writeStream) {
      this.#writeStream.destroy(err)
      this.#writeStream = undefined
    }

    if (typeof this.#handler.onError === 'function') {
      this.#handler.onError(err)
    }
  }

  /**
   * @returns {number}
   */
  #getMaxEntrySize () {
    return this.#opts.store.maxEntrySize ?? Infinity
  }

  /**
   * @param {string[] | Buffer[]} arr
   * @returns {number}
   */
  #getSizeOfBuffers (arr) {
    let size = 0

    if (arr.length > 0) {
      if (typeof arr[0] === 'string') {
        for (const buffer of arr) {
          size += buffer.length
        }
      } else {
        for (const buffer of arr) {
          size += buffer.byteLength
        }
      }
    }

    return size
  }
}

/**
 * @see https://www.rfc-editor.org/rfc/rfc9111.html#name-storing-responses-to-authen
 *
 * @param {number} statusCode
 * @param {Record<string, string>} headers
 * @param {import('../util/cache.js').CacheControlDirectives} cacheControlDirectives
 */
function canCacheResponse (statusCode, headers, cacheControlDirectives) {
  if (
    statusCode !== 200 &&
    statusCode !== 307
  ) {
    return false
  }

  if (
    !cacheControlDirectives.public ||
    cacheControlDirectives.private === true ||
    cacheControlDirectives['no-cache'] === true ||
    cacheControlDirectives['no-store']
  ) {
    return false
  }

  // https://www.rfc-editor.org/rfc/rfc9111.html#section-4.1-5
  if (headers.vary === '*') {
    return false
  }

  // https://www.rfc-editor.org/rfc/rfc9111.html#name-storing-responses-to-authen
  if (headers['authorization']) {
    if (
      Array.isArray(cacheControlDirectives['no-cache']) &&
      cacheControlDirectives['no-cache'].includes('authorization')
    ) {
      return false
    }

    if (
      Array.isArray(cacheControlDirectives['private']) &&
      cacheControlDirectives['private'].includes('authorization')
    ) {
      return false
    }
  }

  return true
}

/**
 * @param {Record<string, string | string[]>} headers
 * @param {import('../util/cache.js').CacheControlDirectives} cacheControlDirectives
 *
 * @returns {number | undefined} time that the value is stale at or undefined if it shouldn't be cached
 */
function determineStaleAt (headers, cacheControlDirectives) {
  // Prioritize s-maxage since we're a shared cache
  //  s-maxage > max-age > Expire
  //  https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.2.10-3
  const sMaxAge = cacheControlDirectives['s-maxage']
  if (sMaxAge) {
    return sMaxAge * 1000
  }

  if (cacheControlDirectives.immutable) {
    // https://www.rfc-editor.org/rfc/rfc8246.html#section-2.2
    return 31536000
  }

  const maxAge = cacheControlDirectives['max-age']
  if (maxAge) {
    return maxAge * 1000
  }

  if (headers.expire) {
    // https://www.rfc-editor.org/rfc/rfc9111.html#section-5.3
    return Date.now() - new Date(headers.expire).getTime()
  }

  return undefined
}

/**
 * @param {import('../util/cache.js').CacheControlDirectives} cacheControlDirectives
 * @param {number} staleAt
 */
function determineDeleteAt (cacheControlDirectives, staleAt) {
  if (cacheControlDirectives['stale-while-revalidate']) {
    return (cacheControlDirectives['stale-while-revalidate'] * 1000)
  }

  return staleAt
}

/**
 * Strips headers required to be removed in cached responses
 * @param {Buffer[]} rawHeaders
 * @param {string[]} parsedHeaders
 * @param {import('../util/cache.js').CacheControlDirectives} cacheControlDirectives
 * @returns {Buffer[]}
 */
function stripNecessaryHeaders (rawHeaders, parsedHeaders, cacheControlDirectives) {
  const headersToRemove = ['connection']

  if (Array.isArray(cacheControlDirectives['no-cache'])) {
    headersToRemove.push(...cacheControlDirectives['no-cache'])
  }

  if (Array.isArray(cacheControlDirectives['private'])) {
    headersToRemove.push(...cacheControlDirectives['private'])
  }

  let strippedRawHeaders
  for (let i = 0; i < parsedHeaders.length; i++) {
    const header = parsedHeaders[i]
    const kvDelimiterIndex = header.indexOf(':')
    if (kvDelimiterIndex === -1) {
      // We should never get here but just for safety
      throw new Error('header missing kv delimiter')
    }

    const headerName = header.substring(0, kvDelimiterIndex)

    if (headerName in headersToRemove) {
      if (!strippedRawHeaders) {
        strippedRawHeaders = rawHeaders.slice(0, i - 1)
      } else {
        strippedRawHeaders.push(rawHeaders[i])
      }
    }
  }

  strippedRawHeaders ??= rawHeaders

  return strippedRawHeaders
}

module.exports = CacheHandler
