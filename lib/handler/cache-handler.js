'use strict'

const util = require('../core/util')
const DecoratorHandler = require('../handler/decorator-handler')
const {
  parseCacheControlHeader,
  parseVaryHeader
} = require('../util/cache')

function noop () {}

/**
 * Writes a response to a CacheStore and then passes it on to the next handler
 */
class CacheHandler extends DecoratorHandler {
  /**
   * @type {import('../../types/cache-interceptor.d.ts').default.CacheStore}
   */
  #store

  /**
   * @type {import('../../types/dispatcher.d.ts').default.RequestOptions}
   */
  #requestOptions

  /**
   * @type {import('../../types/dispatcher.d.ts').default.DispatchHandlers}
   */
  #handler

  /**
   * @type {import('../../types/cache-interceptor.d.ts').default.CacheStoreWriteable | undefined}
   */
  #writeStream

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheOptions} opts
   * @param {import('../../types/dispatcher.d.ts').default.RequestOptions} requestOptions
   * @param {import('../../types/dispatcher.d.ts').default.DispatchHandlers} handler
   */
  constructor (opts, requestOptions, handler) {
    const { store } = opts

    super(handler)

    this.#store = store
    this.#requestOptions = requestOptions
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
      !util.safeHTTPMethods.includes(this.#requestOptions.method) &&
      statusCode >= 200 &&
      statusCode <= 399
    ) {
      // https://www.rfc-editor.org/rfc/rfc9111.html#name-invalidating-stored-response
      try {
        this.#store.deleteByOrigin(this.#requestOptions.origin.toString())?.catch?.(noop)
      } catch {
        // Fail silently
      }
      return downstreamOnHeaders()
    }

    const headers = util.parseHeaders(rawHeaders)

    const cacheControlHeader = headers['cache-control']
    if (!cacheControlHeader || typeof cacheControlHeader !== 'string') {
      // Don't have cache-control, can't cache.
      return downstreamOnHeaders()
    }

    const contentLengthHeader = headers['content-length']
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null
    if (!Number.isInteger(contentLength)) {
      // Don't know the final size, don't cache.
      // TODO (fix): Why not cache?
      return downstreamOnHeaders()
    }

    const cacheControlDirectives = parseCacheControlHeader(cacheControlHeader)
    if (!canCacheResponse(statusCode, headers, cacheControlDirectives)) {
      return downstreamOnHeaders()
    }

    const now = Date.now()
    const staleAt = determineStaleAt(now, headers, cacheControlDirectives)
    if (staleAt) {
      const varyDirectives = headers.vary
        ? parseVaryHeader(headers.vary, this.#requestOptions.headers)
        : undefined
      const deleteAt = determineDeleteAt(now, cacheControlDirectives, staleAt)

      const strippedHeaders = stripNecessaryHeaders(
        rawHeaders,
        headers,
        cacheControlDirectives
      )

      this.#writeStream = this.#store.createWriteStream(this.#requestOptions, {
        statusCode,
        statusMessage,
        rawHeaders: strippedHeaders,
        vary: varyDirectives,
        cachedAt: now,
        staleAt,
        deleteAt
      })

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
      this.#writeStream.rawTrailers = rawTrailers ?? []
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

  if (headers.expire) {
    // https://www.rfc-editor.org/rfc/rfc9111.html#section-5.3
    return now + (Date.now() - new Date(headers.expire).getTime())
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
 * @param {Record<string, string | string[]>} parsedHeaders
 * @param {import('../util/cache.js').CacheControlDirectives} cacheControlDirectives
 * @returns {(Buffer|Buffer[])[]}
 */
function stripNecessaryHeaders (rawHeaders, parsedHeaders, cacheControlDirectives) {
  const headersToRemove = ['connection']

  if (Array.isArray(cacheControlDirectives['no-cache'])) {
    headersToRemove.push(...cacheControlDirectives['no-cache'])
  }

  if (Array.isArray(cacheControlDirectives['private'])) {
    headersToRemove.push(...cacheControlDirectives['private'])
  }

  /**
   * These are the headers that are okay to cache. If this is assigned, we need
   *  to remake the buffer representation of the headers
   * @type {Record<string, string | string[]> | undefined}
   */
  let strippedHeaders

  const headerNames = Object.keys(parsedHeaders)
  for (let i = 0; i < headerNames.length; i++) {
    const header = headerNames[i]

    if (headersToRemove.includes(header)) {
      // We have a at least one header we want to remove
      if (!strippedHeaders) {
        // This is the first header we want to remove, let's create the object
        //  and backfill the previous headers into it
        strippedHeaders = {}

        for (let j = 0; j < i; j++) {
          strippedHeaders[headerNames[j]] = parsedHeaders[headerNames[j]]
        }
      }

      continue
    }

    // This header is fine. Let's add it to strippedHeaders if it exists.
    if (strippedHeaders) {
      strippedHeaders[header] = parsedHeaders[header]
    }
  }

  return strippedHeaders ? util.encodeHeaders(strippedHeaders) : rawHeaders
}

module.exports = CacheHandler
