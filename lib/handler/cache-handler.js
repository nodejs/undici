'use strict'

const util = require('../core/util')
const DecoratorHandler = require('../handler/decorator-handler')
const {
  parseCacheControlHeader,
  parseVaryHeader,
  isEtagUsable
} = require('../util/cache')

function noop () {}

/**
 * Writes a response to a CacheStore and then passes it on to the next handler
 */
class CacheHandler extends DecoratorHandler {
  /**
   * @type {import('../../types/cache-interceptor.d.ts').default.CacheKey}
   */
  #cacheKey

  /**
   * @type {import('../../types/cache-interceptor.d.ts').default.CacheStore}
   */
  #store

  /**
   * @type {import('../../types/dispatcher.d.ts').default.DispatchHandlers}
   */
  #handler

  /**
   * @type {import('node:stream').Writable | undefined}
   */
  #writeStream

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheOptions} opts
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} cacheKey
   * @param {import('../../types/dispatcher.d.ts').default.DispatchHandlers} handler
   */
  constructor (opts, cacheKey, handler) {
    const { store } = opts

    super(handler)

    this.#store = store
    this.#cacheKey = cacheKey
    this.#handler = handler
  }

  onConnect (abort) {
    if (this.#writeStream) {
      this.#writeStream.destroy()
      this.#writeStream = undefined
    }

    if (typeof this.#handler.onConnect === 'function') {
      this.#handler.onConnect(abort)
    }
  }

  /**
   * @see {DispatchHandlers.onHeaders}
   *
   * @param {number} statusCode
   * @param {Buffer[]} rawHeaders
   * @param {() => void} resume
   * @param {string} statusMessage
   * @returns {boolean}
   */
  onHeaders (
    statusCode,
    rawHeaders,
    resume,
    statusMessage
  ) {
    const downstreamOnHeaders = () => {
      if (typeof this.#handler.onHeaders === 'function') {
        return this.#handler.onHeaders(
          statusCode,
          rawHeaders,
          resume,
          statusMessage
        )
      } else {
        return true
      }
    }

    if (
      !util.safeHTTPMethods.includes(this.#cacheKey.method) &&
      statusCode >= 200 &&
      statusCode <= 399
    ) {
      // https://www.rfc-editor.org/rfc/rfc9111.html#name-invalidating-stored-response
      try {
        this.#store.delete(this.#cacheKey).catch?.(noop)
      } catch {
        // Fail silently
      }
      return downstreamOnHeaders()
    }

    const parsedRawHeaders = util.parseRawHeaders(rawHeaders)
    const headers = util.parseHeaders(parsedRawHeaders)

    const cacheControlHeader = headers['cache-control']
    if (!cacheControlHeader) {
      // Don't have the cache control header or the cache is full
      return downstreamOnHeaders()
    }

    const cacheControlDirectives = parseCacheControlHeader(cacheControlHeader)
    if (!canCacheResponse(statusCode, headers, cacheControlDirectives)) {
      return downstreamOnHeaders()
    }

    const now = Date.now()
    const staleAt = determineStaleAt(now, headers, cacheControlDirectives)
    if (staleAt) {
      const varyDirectives = this.#cacheKey.headers && headers.vary
        ? parseVaryHeader(headers.vary, this.#cacheKey.headers)
        : undefined
      const deleteAt = determineDeleteAt(now, cacheControlDirectives, staleAt)

      const strippedHeaders = stripNecessaryHeaders(
        rawHeaders,
        parsedRawHeaders,
        cacheControlDirectives
      )

      /**
       * @type {import('../../types/cache-interceptor.d.ts').default.CacheValue}
       */
      const value = {
        statusCode,
        statusMessage,
        rawHeaders: strippedHeaders,
        vary: varyDirectives,
        cachedAt: now,
        staleAt,
        deleteAt
      }

      if (typeof headers.etag === 'string' && isEtagUsable(headers.etag)) {
        value.etag = headers.etag
      }

      this.#writeStream = this.#store.createWriteStream(this.#cacheKey, value)

      if (this.#writeStream) {
        const handler = this
        this.#writeStream
          .on('drain', resume)
          .on('error', function () {
            // TODO (fix): Make error somehow observable?
          })
          .on('close', function () {
            if (handler.#writeStream === this) {
              handler.#writeStream = undefined
            }

            // TODO (fix): Should we resume even if was paused downstream?
            resume()
          })
      }
    }

    return downstreamOnHeaders()
  }

  /**
   * @see {DispatchHandlers.onData}
   *
   * @param {Buffer} chunk
   * @returns {boolean}
   */
  onData (chunk) {
    let paused = false

    if (this.#writeStream) {
      paused ||= this.#writeStream.write(chunk) === false
    }

    if (typeof this.#handler.onData === 'function') {
      paused ||= this.#handler.onData(chunk) === false
    }

    return !paused
  }

  /**
   * @see {DispatchHandlers.onComplete}
   *
   * @param {string[] | null} rawTrailers
   */
  onComplete (rawTrailers) {
    if (this.#writeStream) {
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
}

/**
 * @see https://www.rfc-editor.org/rfc/rfc9111.html#name-storing-responses-to-authen
 *
 * @param {number} statusCode
 * @param {Record<string, string | string[]>} headers
 * @param {import('../util/cache.js').CacheControlDirectives} cacheControlDirectives
 */
function canCacheResponse (statusCode, headers, cacheControlDirectives) {
  if (statusCode !== 200 && statusCode !== 307) {
    return false
  }

  if (
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
  if (headers.authorization) {
    if (!cacheControlDirectives.public || typeof headers.authorization !== 'string') {
      return false
    }

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
 * @param {number} now
 * @param {Record<string, string | string[]>} headers
 * @param {import('../util/cache.js').CacheControlDirectives} cacheControlDirectives
 *
 * @returns {number | undefined} time that the value is stale at or undefined if it shouldn't be cached
 */
function determineStaleAt (now, headers, cacheControlDirectives) {
  // Prioritize s-maxage since we're a shared cache
  //  s-maxage > max-age > Expire
  //  https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.2.10-3
  const sMaxAge = cacheControlDirectives['s-maxage']
  if (sMaxAge) {
    return now + (sMaxAge * 1000)
  }

  if (cacheControlDirectives.immutable) {
    // https://www.rfc-editor.org/rfc/rfc8246.html#section-2.2
    return now + 31536000
  }

  const maxAge = cacheControlDirectives['max-age']
  if (maxAge) {
    return now + (maxAge * 1000)
  }

  if (headers.expire && typeof headers.expire === 'string') {
    // https://www.rfc-editor.org/rfc/rfc9111.html#section-5.3
    const expiresDate = new Date(headers.expire)
    if (expiresDate instanceof Date && Number.isFinite(expiresDate.valueOf())) {
      return now + (Date.now() - expiresDate.getTime())
    }
  }

  return undefined
}

/**
 * @param {number} now
 * @param {import('../util/cache.js').CacheControlDirectives} cacheControlDirectives
 * @param {number} staleAt
 */
function determineDeleteAt (now, cacheControlDirectives, staleAt) {
  if (cacheControlDirectives['stale-while-revalidate']) {
    return now + (cacheControlDirectives['stale-while-revalidate'] * 1000)
  }

  return staleAt
}

/**
 * Strips headers required to be removed in cached responses
 * @param {Buffer[]} rawHeaders
 * @param {string[]} parsedRawHeaders
 * @param {import('../util/cache.js').CacheControlDirectives} cacheControlDirectives
 * @returns {Buffer[]}
 */
function stripNecessaryHeaders (rawHeaders, parsedRawHeaders, cacheControlDirectives) {
  const headersToRemove = ['connection']

  if (Array.isArray(cacheControlDirectives['no-cache'])) {
    headersToRemove.push(...cacheControlDirectives['no-cache'])
  }

  if (Array.isArray(cacheControlDirectives['private'])) {
    headersToRemove.push(...cacheControlDirectives['private'])
  }

  let strippedHeaders

  let offset = 0
  for (let i = 0; i < parsedRawHeaders.length; i += 2) {
    const headerName = parsedRawHeaders[i]

    if (headersToRemove.includes(headerName)) {
      // We have at least one header we want to remove
      if (!strippedHeaders) {
        // This is the first header we want to remove, let's create the array
        // Since we're stripping headers, this will over allocate. We'll trim
        //  it later.
        strippedHeaders = new Array(parsedRawHeaders.length)

        // Backfill the previous headers into it
        for (let j = 0; j < i; j += 2) {
          strippedHeaders[j] = parsedRawHeaders[j]
          strippedHeaders[j + 1] = parsedRawHeaders[j + 1]
        }
      }

      // We can't map indices 1:1 from stripped headers to rawHeaders without
      //  creating holes (if we skip a header, we now have two holes where at
      //  element should be). So, let's keep an offset to keep strippedHeaders
      //  flattened. We can also use this at the end for trimming the empty
      //  elements off of strippedHeaders.
      offset += 2

      continue
    }

    // We want to keep this header. Let's add it to strippedHeaders if it exists
    if (strippedHeaders) {
      strippedHeaders[i - offset] = parsedRawHeaders[i]
      strippedHeaders[i + 1 - offset] = parsedRawHeaders[i + 1]
    }
  }

  if (strippedHeaders) {
    // Trim off the empty values at the end
    strippedHeaders.length -= offset
  }

  return strippedHeaders ? util.encodeRawHeaders(strippedHeaders) : rawHeaders
}

module.exports = CacheHandler
