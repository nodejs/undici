'use strict'

const util = require('../core/util')
const DecoratorHandler = require('../handler/decorator-handler')
const { parseCacheControlHeader, parseVaryHeader } = require('../util/cache')

class CacheHandler extends DecoratorHandler {
  /**
   * @type {import('../../types/cache-interceptor.d.ts').default.CacheOptions}
   */
  #opts = null
  /**
   * @type {import('../../types/dispatcher.d.ts').default.RequestOptions}
   */
  #req = null
  /**
   * @type {import('../../types/dispatcher.d.ts').default.DispatchHandlers}
   */
  #handler = null
  /**
   * @type {import('../../types/cache-interceptor.d.ts').default.CacheStoreValue | undefined}
   */
  #value = null

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
   * @param {string[] | undefined} headers
   * @returns
   */
  onHeaders (
    statusCode,
    rawHeaders,
    resume,
    statusMessage,
    headers = util.parseHeaders(rawHeaders)
  ) {
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

    const maxEntrySize = this.#getMaxEntrySize()
    const contentLength = Number(headers['content-length'])
    const currentSize =
      this.#getSizeOfBuffers(rawHeaders) + (statusMessage?.length ?? 0) + 64
    if (
      isNaN(contentLength) ||
      contentLength > maxEntrySize ||
      currentSize > maxEntrySize
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

      this.#value = {
        complete: false,
        statusCode,
        statusMessage,
        rawHeaders: strippedHeaders,
        body: [],
        vary: varyDirectives,
        size: currentSize,
        cachedAt: now,
        staleAt: now + staleAt,
        deleteAt: now + deleteAt
      }
    }

    return this.#handler.onHeaders(
      statusCode,
      rawHeaders,
      resume,
      statusMessage,
      headers
    )
  }

  /**
   * @see {DispatchHandlers.onData}
   *
   * @param {Buffer} chunk
   * @returns {boolean}
   */
  onData (chunk) {
    if (this.#value) {
      this.#value.size += chunk.length

      if (this.#value.size > this.#getMaxEntrySize()) {
        this.#value = null
      } else {
        this.#value.body.push(chunk)
      }
    }

    return this.#handler.onData(chunk)
  }

  /**
   * @see {DispatchHandlers.onComplete}
   *
   * @param {string[] | null} rawTrailers
   */
  onComplete (rawTrailers) {
    if (this.#value) {
      this.#value.complete = true
      this.#value.rawTrailers = rawTrailers
      this.#value.size += this.#getSizeOfBuffers(rawTrailers)

      // If we're still under the max entry size, let's add it to the cache
      if (this.#getMaxEntrySize() > this.#value.size) {
        const result = this.#opts.store.put(this.#req, this.#value)
        if (result && result.constructor.name === 'Promise') {
          result.catch(err => {
            throw err
          })
        }
      }
    }

    return this.#handler.onComplete(rawTrailers)
  }

  /**
   * @see {DispatchHandlers.onError}
   *
   * @param {Error} err
   */
  onError (err) {
    this.#value = undefined
    this.#handler.onError(err)
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

    for (const buffer of arr) {
      size += buffer.length
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
  if (![200, 307].includes(statusCode)) {
    return false
  }

  if (
    !cacheControlDirectives.public &&
    !cacheControlDirectives['s-maxage'] &&
    !cacheControlDirectives['must-revalidate']
  ) {
    // Response can't be used in a shared cache
    return false
  }

  if (
    // TODO double check these
    cacheControlDirectives.private === true ||
    cacheControlDirectives['no-cache'] === true ||
    cacheControlDirectives['no-store'] ||
    cacheControlDirectives['no-transform'] ||
    cacheControlDirectives['must-understand'] ||
    cacheControlDirectives['proxy-revalidate']
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
 * @param {Record<string, string>} headers
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
    return new Date() - new Date(headers.expire)
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
