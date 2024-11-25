'use strict'

const util = require('../core/util')
const {
  parseCacheControlHeader,
  parseVaryHeader,
  isEtagUsable
} = require('../util/cache')

function noop () {}

/**
 * @implements {import('../../types/dispatcher.d.ts').default.DispatchHandler}
 */
class CacheHandler {
  /**
   * @type {import('../../types/cache-interceptor.d.ts').default.CacheKey}
   */
  #cacheKey

  /**
   * @type {import('../../types/cache-interceptor.d.ts').default.CacheStore}
   */
  #store

  /**
   * @type {import('../../types/dispatcher.d.ts').default.DispatchHandler}
   */
  #handler

  /**
   * @type {import('node:stream').Writable | undefined}
   */
  #writeStream

  /**
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheHandlerOptions} opts
   * @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} cacheKey
   * @param {import('../../types/dispatcher.d.ts').default.DispatchHandler} handler
   */
  constructor ({ store }, cacheKey, handler) {
    this.#store = store
    this.#cacheKey = cacheKey
    this.#handler = handler
  }

  onRequestStart (controller, context) {
    this.#writeStream?.destroy()
    this.#writeStream = undefined
    this.#handler.onRequestStart?.(controller, context)
  }

  onRequestUpgrade (controller, statusCode, headers, socket) {
    this.#handler.onRequestUpgrade?.(controller, statusCode, headers, socket)
  }

  onResponseStart (
    controller,
    statusCode,
    statusMessage,
    headers
  ) {
    const downstreamOnHeaders = () =>
      this.#handler.onResponseStart?.(
        controller,
        statusCode,
        statusMessage,
        headers
      )

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

      const strippedHeaders = stripNecessaryHeaders(headers, cacheControlDirectives)

      /**
       * @type {import('../../types/cache-interceptor.d.ts').default.CacheValue}
       */
      const value = {
        statusCode,
        statusMessage,
        headers: strippedHeaders,
        vary: varyDirectives,
        cacheControlDirectives,
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
          .on('drain', () => controller.resume())
          .on('error', function () {
            // TODO (fix): Make error somehow observable?
          })
          .on('close', function () {
            if (handler.#writeStream === this) {
              handler.#writeStream = undefined
            }

            // TODO (fix): Should we resume even if was paused downstream?
            controller.resume()
          })
      }
    }

    return downstreamOnHeaders()
  }

  onResponseData (controller, chunk) {
    if (this.#writeStream?.write(chunk) === false) {
      controller.pause()
    }

    this.#handler.onResponseData?.(controller, chunk)
  }

  onResponseEnd (controller, trailers) {
    this.#writeStream?.end()
    this.#handler.onResponseEnd?.(controller, trailers)
  }

  onResponseError (controller, err) {
    this.#writeStream?.destroy(err)
    this.#writeStream = undefined
    this.#handler.onResponseError?.(controller, err)
  }
}

/**
 * @see https://www.rfc-editor.org/rfc/rfc9111.html#name-storing-responses-to-authen
 *
 * @param {number} statusCode
 * @param {Record<string, string | string[]>} headers
 * @param {import('../../types/cache-interceptor.d.ts').default.CacheControlDirectives} cacheControlDirectives
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
 * @param {import('../../types/cache-interceptor.d.ts').default.CacheControlDirectives} cacheControlDirectives
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
 * @param {import('../../types/cache-interceptor.d.ts').default.CacheControlDirectives} cacheControlDirectives
 * @param {number} staleAt
 */
function determineDeleteAt (now, cacheControlDirectives, staleAt) {
  let staleWhileRevalidate = -Infinity
  let staleIfError = -Infinity

  if (cacheControlDirectives['stale-while-revalidate']) {
    staleWhileRevalidate = now + (cacheControlDirectives['stale-while-revalidate'] * 1000)
  }

  if (cacheControlDirectives['stale-if-error']) {
    staleIfError = now + (cacheControlDirectives['stale-if-error'] * 1000)
  }

  return Math.max(staleAt, staleWhileRevalidate, staleIfError)
}

/**
 * Strips headers required to be removed in cached responses
 * @param {Record<string, string | string[]>} headers
 * @param {import('../../types/cache-interceptor.d.ts').default.CacheControlDirectives} cacheControlDirectives
 * @returns {Record<string, string | string []>}
 */
function stripNecessaryHeaders (headers, cacheControlDirectives) {
  const headersToRemove = ['connection']

  if (Array.isArray(cacheControlDirectives['no-cache'])) {
    headersToRemove.push(...cacheControlDirectives['no-cache'])
  }

  if (Array.isArray(cacheControlDirectives['private'])) {
    headersToRemove.push(...cacheControlDirectives['private'])
  }

  let strippedHeaders
  for (const headerName of Object.keys(headers)) {
    if (headersToRemove.includes(headerName)) {
      strippedHeaders ??= { ...headers }
      delete headers[headerName]
    }
  }
  return strippedHeaders ?? headers
}

module.exports = CacheHandler
