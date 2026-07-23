'use strict'

const util = require('../core/util')
const {
  parseCacheControlHeader,
  parseVaryHeader,
  isEtagUsable
} = require('../util/cache')
const { parseHttpDate } = require('../util/date.js')

function noop () {}

// Status codes that we can use some heuristics on to cache
const HEURISTICALLY_CACHEABLE_STATUS_CODES = [
  200, 203, 204, 206, 300, 301, 308, 404, 405, 410, 414, 501
]

// Status codes which semantic is not handled by the cache
// https://datatracker.ietf.org/doc/html/rfc9111#section-3
// This list should not grow beyond 206 unless the RFC is updated
// by a newer one including more. Please introduce another list if
// implementing caching of responses with the 'must-understand' directive.
const NOT_UNDERSTOOD_STATUS_CODES = [
  206
]

const MAX_RESPONSE_AGE = 2147483647000

// Retention for revalidation-only entries (zero freshness lifetime but a
//  validator present); each successful revalidation re-stores the entry.
const REVALIDATION_ONLY_RETENTION = 86400000 // 24 hours

/**
 * @typedef {import('../../types/dispatcher.d.ts').default.DispatchHandler} DispatchHandler
 *
 * @implements {DispatchHandler}
 */
class CacheHandler {
  /**
   * @type {import('../../types/cache-interceptor.d.ts').default.CacheKey}
   */
  #cacheKey

  /**
   * @type {import('../../types/cache-interceptor.d.ts').default.CacheHandlerOptions['type']}
   */
  #cacheType

  /**
   * @type {number | undefined}
   */
  #cacheByDefault

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
  constructor ({ store, type, cacheByDefault }, cacheKey, handler) {
    this.#store = store
    this.#cacheType = type
    this.#cacheByDefault = cacheByDefault
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

  /**
   * @param {import('../../types/dispatcher.d.ts').default.DispatchController} controller
   * @param {number} statusCode
   * @param {import('../../types/header.d.ts').IncomingHttpHeaders} resHeaders
   * @param {string} statusMessage
   */
  onResponseStart (
    controller,
    statusCode,
    resHeaders,
    statusMessage
  ) {
    const downstreamOnHeaders = () =>
      this.#handler.onResponseStart?.(
        controller,
        statusCode,
        resHeaders,
        statusMessage
      )
    const handler = this

    if (
      !util.safeHTTPMethods.includes(this.#cacheKey.method) &&
      statusCode >= 200 &&
      statusCode <= 399
    ) {
      // Successful response to an unsafe method, delete it from cache
      //  https://www.rfc-editor.org/rfc/rfc9111.html#name-invalidating-stored-response
      try {
        this.#store.delete(this.#cacheKey)?.catch?.(noop)
      } catch {
        // Fail silently
      }
      this.#deleteLocationHeaderEntries(resHeaders)
      return downstreamOnHeaders()
    }

    // Not modified, freshen the stored response and re-use its body
    // https://www.rfc-editor.org/rfc/rfc9111.html#name-freshening-stored-responses
    if (statusCode === 304) {
      return this.#handle304(controller, resHeaders, downstreamOnHeaders)
    }

    const cacheControlHeader = resHeaders['cache-control']
    const heuristicallyCacheable = resHeaders['last-modified'] && HEURISTICALLY_CACHEABLE_STATUS_CODES.includes(statusCode)
    if (
      !cacheControlHeader &&
      !resHeaders['expires'] &&
      !heuristicallyCacheable &&
      !this.#cacheByDefault
    ) {
      // Don't have anything to tell us this response is cachable and we're not
      //  caching by default
      return downstreamOnHeaders()
    }

    const cacheControlDirectives = cacheControlHeader ? parseCacheControlHeader(cacheControlHeader) : {}
    if (!canCacheResponse(this.#cacheType, statusCode, resHeaders, cacheControlDirectives, this.#cacheKey.headers)) {
      return downstreamOnHeaders()
    }

    const now = Date.now()
    const resAge = resHeaders.age ? getAge(resHeaders.age) : undefined
    if (resAge && resAge >= MAX_RESPONSE_AGE) {
      // Response considered stale
      return downstreamOnHeaders()
    }

    const resDate = typeof resHeaders.date === 'string'
      ? parseHttpDate(resHeaders.date)
      : undefined

    const hasValidator =
      (typeof resHeaders.etag === 'string' && isEtagUsable(resHeaders.etag)) ||
      typeof resHeaders['last-modified'] === 'string'

    const staleAt =
      determineStaleAt(this.#cacheType, now, resAge, resHeaders, resDate, cacheControlDirectives, hasValidator) ??
      this.#cacheByDefault
    if (staleAt === undefined || (resAge && resAge > staleAt)) {
      return downstreamOnHeaders()
    }

    const baseTime = resDate ? resDate.getTime() : now
    const absoluteStaleAt = staleAt + baseTime
    // Zero freshness lifetime but a validator: stale from the start, yet still
    //  storable since each reuse is preceded by a revalidation request.
    //  https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.2.4
    const revalidationOnly = staleAt === 0 && hasValidator
    if (now >= absoluteStaleAt && !revalidationOnly) {
      // Response is already stale
      return downstreamOnHeaders()
    }

    let varyDirectives
    if (this.#cacheKey.headers && resHeaders.vary) {
      varyDirectives = parseVaryHeader(resHeaders.vary, this.#cacheKey.headers)
      if (!varyDirectives) {
        // Parse error
        return downstreamOnHeaders()
      }
    }

    const cachedAt = resAge ? now - resAge : now
    const deleteAt = determineDeleteAt(baseTime, cachedAt, cacheControlDirectives, absoluteStaleAt)
    const strippedHeaders = stripNecessaryHeaders(resHeaders, cacheControlDirectives)

    /**
     * @type {import('../../types/cache-interceptor.d.ts').default.CacheValue}
     */
    const value = {
      statusCode,
      statusMessage,
      headers: strippedHeaders,
      vary: varyDirectives,
      cacheControlDirectives,
      cachedAt,
      staleAt: absoluteStaleAt,
      deleteAt
    }

    if (typeof resHeaders.etag === 'string' && isEtagUsable(resHeaders.etag)) {
      value.etag = resHeaders.etag
    }

    this.#writeStream = this.#store.createWriteStream(this.#cacheKey, value)

    if (!this.#writeStream) {
      return downstreamOnHeaders()
    }

    this.#writeStream
      .on('drain', () => controller.resume())
      .on('error', function () {
        // TODO (fix): Make error somehow observable?
        handler.#writeStream = undefined

        // Delete the value in case the cache store is holding onto state from
        //  the call to createWriteStream
        handler.#store.delete(handler.#cacheKey)
      })
      .on('close', function () {
        if (handler.#writeStream === this) {
          handler.#writeStream = undefined
        }

        // TODO (fix): Should we resume even if was paused downstream?
        controller.resume()
      })

    downstreamOnHeaders()
  }

  /**
   * Handles a 304 Not Modified validation response by updating the stored
   *  response with the validation response's header fields and recomputing
   *  its freshness from the merged headers, per RFC 9111 §4.3.4.
   *
   * https://www.rfc-editor.org/rfc/rfc9111.html#name-freshening-stored-responses
   *
   * @param {import('../../types/dispatcher.d.ts').default.DispatchController} controller
   * @param {import('../../types/header.d.ts').IncomingHttpHeaders} resHeaders
   * @param {() => void} downstreamOnHeaders
   */
  #handle304 (controller, resHeaders, downstreamOnHeaders) {
    const handler = this

    const handle304 = (cachedValue) => {
      if (!cachedValue) {
        // Do not create a new cache entry, as a 304 won't have a body - so cannot be cached.
        return downstreamOnHeaders()
      }

      // https://www.rfc-editor.org/rfc/rfc9111.html#section-4.3.4-4
      const headers = mergeValidationHeaders(cachedValue.headers, resHeaders)
      const cacheControlDirectives = headers['cache-control']
        ? parseCacheControlHeader(headers['cache-control'])
        : {}

      if (!canCacheResponse(this.#cacheType, cachedValue.statusCode, headers, cacheControlDirectives, this.#cacheKey.headers)) {
        // The freshened response is no longer storable, leave the stored entry as-is
        return downstreamOnHeaders()
      }

      const now = Date.now()
      const resAge = resHeaders.age ? getAge(resHeaders.age) : undefined
      if (resAge && resAge >= MAX_RESPONSE_AGE) {
        return downstreamOnHeaders()
      }

      const resDate = typeof resHeaders.date === 'string'
        ? parseHttpDate(resHeaders.date)
        : undefined

      // Recompute freshness from the merged headers, not just those on the 304
      const staleAt =
        determineStaleAt(this.#cacheType, now, resAge, headers, resDate, cacheControlDirectives) ??
        this.#cacheByDefault
      if (staleAt === undefined || (resAge && resAge > staleAt)) {
        return downstreamOnHeaders()
      }

      const baseTime = resDate ? resDate.getTime() : now
      const absoluteStaleAt = staleAt + baseTime
      if (now >= absoluteStaleAt) {
        // Still stale after freshening, leave the stored entry as it is
        return downstreamOnHeaders()
      }

      let varyDirectives
      if (this.#cacheKey.headers && headers.vary) {
        varyDirectives = parseVaryHeader(headers.vary, this.#cacheKey.headers)
        if (!varyDirectives) {
          // Parse error
          return downstreamOnHeaders()
        }
      }

      const cachedAt = resAge ? now - resAge : now

      /**
       * @type {import('../../types/cache-interceptor.d.ts').default.CacheValue}
       */
      const value = {
        statusCode: cachedValue.statusCode,
        statusMessage: cachedValue.statusMessage,
        headers,
        vary: varyDirectives,
        cacheControlDirectives,
        cachedAt,
        staleAt: absoluteStaleAt,
        deleteAt: determineDeleteAt(baseTime, cachedAt, cacheControlDirectives, absoluteStaleAt)
      }

      if (typeof resHeaders.etag === 'string' && isEtagUsable(resHeaders.etag)) {
        value.etag = resHeaders.etag
      } else {
        value.etag = cachedValue.etag
      }

      downstreamOnHeaders()

      this.#writeStream = this.#store.createWriteStream(this.#cacheKey, value)

      if (!this.#writeStream || !cachedValue.body) {
        return
      }

      if (typeof cachedValue.body.on === 'function') {
        // Readable stream body (e.g. from async/remote cache stores)
        cachedValue.body
          .on('data', (chunk) => {
            this.#writeStream.write(chunk)
            this.#handler.onResponseData?.(controller, chunk)
          })
          .on('end', () => {
            this.#writeStream.end()
          })
          .on('error', () => {
            this.#writeStream = undefined
            this.#store.delete(this.#cacheKey)
          })

        this.#writeStream
          .on('error', function () {
            handler.#writeStream = undefined
            handler.#store.delete(handler.#cacheKey)
          })
          .on('close', function () {
            if (handler.#writeStream === this) {
              handler.#writeStream = undefined
            }
          })
      } else {
        // Iterable of chunks (e.g. MemoryCacheStore), or a single Buffer
        //  (e.g. SqliteCacheStore) whose values() would iterate single bytes
        const bodyIterator = typeof cachedValue.body.values === 'function' && !ArrayBuffer.isView(cachedValue.body)
          ? cachedValue.body.values()
          : [cachedValue.body].values()

        const streamCachedBody = () => {
          for (const chunk of bodyIterator) {
            const full = this.#writeStream.write(chunk) === false
            this.#handler.onResponseData?.(controller, chunk)
            // when stream is full stop writing until we get a 'drain' event
            if (full) {
              break
            }
          }
        }

        this.#writeStream
          .on('error', function () {
            handler.#writeStream = undefined
            handler.#store.delete(handler.#cacheKey)
          })
          .on('drain', () => {
            streamCachedBody()
          })
          .on('close', function () {
            if (handler.#writeStream === this) {
              handler.#writeStream = undefined
            }
          })

        streamCachedBody()
      }
    }

    /**
     * @type {import('../../types/cache-interceptor.d.ts').default.CacheValue}
     */
    const result = this.#store.get(this.#cacheKey)
    if (result && typeof result.then === 'function') {
      result.then(handle304)
    } else {
      handle304(result)
    }
  }

  /**
   * Deletes the cache entries for the URIs in the response's Location and
   * Content-Location headers when they share the request URI's origin
   *  https://www.rfc-editor.org/rfc/rfc9111.html#section-4.4
   *
   * @param {import('../../types/header.d.ts').IncomingHttpHeaders} resHeaders
   */
  #deleteLocationHeaderEntries (resHeaders) {
    let requestUrl
    try {
      requestUrl = new URL(this.#cacheKey.path, this.#cacheKey.origin)
    } catch {
      // Can't resolve the request URI, don't invalidate anything else
      return
    }

    const invalidatedPaths = new Set([this.#cacheKey.path])

    for (const headerName of ['location', 'content-location']) {
      const header = resHeaders[headerName]
      const value = Array.isArray(header) ? header[0] : header
      if (typeof value !== 'string' || value === '') {
        continue
      }

      let url
      try {
        url = new URL(value, requestUrl)
      } catch {
        continue
      }

      if (url.origin !== requestUrl.origin) {
        // Only invalidate URIs sharing the request URI's origin, invalidating
        //  cross-origin URIs could be used for cache poisoning
        continue
      }

      const path = `${url.pathname}${url.search}`
      if (invalidatedPaths.has(path)) {
        continue
      }
      invalidatedPaths.add(path)

      try {
        this.#store.delete({ ...this.#cacheKey, path })?.catch?.(noop)
      } catch {
        // Fail silently
      }
    }
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
 * @param {import('../../types/cache-interceptor.d.ts').default.CacheOptions['type']} cacheType
 * @param {number} statusCode
 * @param {import('../../types/header.d.ts').IncomingHttpHeaders} resHeaders
 * @param {import('../../types/cache-interceptor.d.ts').default.CacheControlDirectives} cacheControlDirectives
 * @param {import('../../types/header.d.ts').IncomingHttpHeaders} [reqHeaders]
 */
function canCacheResponse (cacheType, statusCode, resHeaders, cacheControlDirectives, reqHeaders) {
  // Status code must be final and understood.
  if (statusCode < 200 || NOT_UNDERSTOOD_STATUS_CODES.includes(statusCode)) {
    return false
  }
  // Responses with neither status codes that are heuristically cacheable, nor "explicit enough" caching
  // directives, are not cacheable. "Explicit enough": see https://www.rfc-editor.org/rfc/rfc9111.html#section-3
  if (!HEURISTICALLY_CACHEABLE_STATUS_CODES.includes(statusCode) && !resHeaders['expires'] &&
    !cacheControlDirectives.public &&
    cacheControlDirectives['max-age'] === undefined &&
    // RFC 9111: a private response directive, if the cache is not shared
    !(cacheControlDirectives.private && cacheType === 'private') &&
    !(cacheControlDirectives['s-maxage'] !== undefined && cacheType === 'shared')
  ) {
    return false
  }

  if (cacheControlDirectives['no-store']) {
    return false
  }

  if (cacheType === 'shared' && cacheControlDirectives.private === true) {
    return false
  }

  // https://www.rfc-editor.org/rfc/rfc9111.html#section-4.1-5
  if (resHeaders.vary?.includes('*')) {
    return false
  }

  // https://www.rfc-editor.org/rfc/rfc9111.html#name-storing-responses-to-authen
  if (reqHeaders?.authorization) {
    if (
      !cacheControlDirectives.public &&
      !cacheControlDirectives['s-maxage'] &&
      !cacheControlDirectives['must-revalidate']
    ) {
      return false
    }

    if (typeof reqHeaders.authorization !== 'string') {
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
 * @param {string | string[]} ageHeader
 * @returns {number | undefined}
 */
function getAge (ageHeader) {
  const age = parseInt(Array.isArray(ageHeader) ? ageHeader[0] : ageHeader)

  return isNaN(age) ? undefined : age * 1000
}

/**
 * @param {import('../../types/cache-interceptor.d.ts').default.CacheOptions['type']} cacheType
 * @param {number} now
 * @param {number | undefined} age
 * @param {import('../../types/header.d.ts').IncomingHttpHeaders} resHeaders
 * @param {Date | undefined} responseDate
 * @param {import('../../types/cache-interceptor.d.ts').default.CacheControlDirectives} cacheControlDirectives
 * @param {boolean} hasValidator whether the response has a validator (etag or
 *  last-modified) that revalidation requests can be made with
 *
 * @returns {number | undefined} time that the value is stale at in seconds or undefined if it shouldn't be cached
 */
function determineStaleAt (cacheType, now, age, resHeaders, responseDate, cacheControlDirectives, hasValidator) {
  if (cacheType === 'shared') {
    // Prioritize s-maxage since we're a shared cache
    //  s-maxage > max-age > Expire
    //  https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.2.10-3
    const sMaxAge = cacheControlDirectives['s-maxage']
    if (sMaxAge !== undefined) {
      if (sMaxAge > 0) {
        return sMaxAge * 1000
      }

      // Immediately stale, but storable if we can revalidate it before reuse.
      return sMaxAge === 0 && hasValidator ? 0 : undefined
    }
  }

  const maxAge = cacheControlDirectives['max-age']
  if (maxAge !== undefined) {
    if (maxAge > 0) {
      return maxAge * 1000
    }

    // Immediately stale, but storable if we can revalidate it before reuse.
    return maxAge === 0 && hasValidator ? 0 : undefined
  }

  if (typeof resHeaders.expires === 'string') {
    // https://www.rfc-editor.org/rfc/rfc9111.html#section-5.3
    const expiresDate = parseHttpDate(resHeaders.expires)
    if (expiresDate) {
      if (now >= expiresDate.getTime()) {
        return undefined
      }

      if (responseDate) {
        if (responseDate >= expiresDate) {
          return undefined
        }

        if (age !== undefined && age > (expiresDate - responseDate)) {
          return undefined
        }
      }

      return expiresDate.getTime() - now
    }
  }

  if (typeof resHeaders['last-modified'] === 'string') {
    // https://www.rfc-editor.org/rfc/rfc9111.html#name-calculating-heuristic-fresh
    const lastModified = new Date(resHeaders['last-modified'])
    if (isValidDate(lastModified)) {
      if (lastModified.getTime() >= now) {
        return undefined
      }

      const responseAge = now - lastModified.getTime()

      return responseAge * 0.1
    }
  }

  if (cacheControlDirectives.immutable) {
    // https://www.rfc-editor.org/rfc/rfc8246.html#section-2.2
    return 31536000000
  }

  if (cacheControlDirectives['no-cache'] === true && hasValidator) {
    // No freshness source, but a validator lets us revalidate before reuse.
    //  https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.2.4
    return 0
  }

  return undefined
}

/**
 * @param {number} baseTime
 * @param {number} cachedAt
 * @param {import('../../types/cache-interceptor.d.ts').default.CacheControlDirectives} cacheControlDirectives
 * @param {number} staleAt
 */
function determineDeleteAt (baseTime, cachedAt, cacheControlDirectives, staleAt) {
  let staleWhileRevalidate = -Infinity
  let staleIfError = -Infinity
  let immutable = -Infinity

  if (cacheControlDirectives['stale-while-revalidate']) {
    staleWhileRevalidate = staleAt + (cacheControlDirectives['stale-while-revalidate'] * 1000)
  }

  if (cacheControlDirectives['stale-if-error']) {
    staleIfError = staleAt + (cacheControlDirectives['stale-if-error'] * 1000)
  }

  if (cacheControlDirectives.immutable && staleWhileRevalidate === -Infinity && staleIfError === -Infinity) {
    immutable = cachedAt + 31536000000
  }

  // When no stale directives or immutable flag, add a revalidation buffer
  // equal to the freshness lifetime so the entry survives past staleAt long
  // enough to be revalidated instead of silently disappearing.
  //
  // Response Date headers only have second precision, so baseTime can trail the
  // actual cache insertion time by up to ~1s. Pad the buffer by that bounded
  // skew so short-lived entries do not disappear exactly when they should be
  // revalidated.
  if (staleWhileRevalidate === -Infinity && staleIfError === -Infinity && immutable === -Infinity) {
    const freshnessLifetime = staleAt - baseTime
    if (freshnessLifetime <= 0) {
      // Revalidation-only entry: no freshness lifetime to size the buffer on,
      //  so retain it for a bounded window instead.
      return cachedAt + REVALIDATION_ONLY_RETENTION
    }
    const datePrecisionPadding = Math.min(Math.max(cachedAt - baseTime, 0), 1000)
    return staleAt + freshnessLifetime + datePrecisionPadding
  }

  return Math.max(staleAt, staleWhileRevalidate, staleIfError, immutable)
}

/**
 * Updates stored response headers with the ones of a validation response,
 *  per RFC 9111 §4.3.4. Content-Length is not carried over since it
 *  describes the validation response, not the stored body.
 *
 * https://www.rfc-editor.org/rfc/rfc9111.html#section-4.3.4-4
 *
 * @param {Record<string, string | string[]>} cachedHeaders headers of the stored response
 * @param {import('../../types/header.d.ts').IncomingHttpHeaders} resHeaders headers of the validation response
 * @returns {Record<string, string | string[]>}
 */
function mergeValidationHeaders (cachedHeaders, resHeaders) {
  const cacheControlDirectives = resHeaders['cache-control']
    ? parseCacheControlHeader(resHeaders['cache-control'])
    : {}
  const validationHeaders = { ...stripNecessaryHeaders(resHeaders, cacheControlDirectives) }
  delete validationHeaders['content-length']

  return { ...cachedHeaders, ...validationHeaders }
}

/**
 * Strips headers required to be removed in cached responses
 * @param {import('../../types/header.d.ts').IncomingHttpHeaders} resHeaders
 * @param {import('../../types/cache-interceptor.d.ts').default.CacheControlDirectives} cacheControlDirectives
 * @returns {Record<string, string | string []>}
 */
function stripNecessaryHeaders (resHeaders, cacheControlDirectives) {
  const headersToRemove = [
    'connection',
    'proxy-authenticate',
    'proxy-authentication-info',
    'proxy-authorization',
    'proxy-connection',
    'te',
    'transfer-encoding',
    'upgrade',
    // We'll add age back when serving it
    'age'
  ]

  if (resHeaders['connection']) {
    if (Array.isArray(resHeaders['connection'])) {
      // connection: a
      // connection: b
      headersToRemove.push(...resHeaders['connection'].map(header => header.trim()))
    } else {
      // connection: a, b
      headersToRemove.push(...resHeaders['connection'].split(',').map(header => header.trim()))
    }
  }

  if (Array.isArray(cacheControlDirectives['no-cache'])) {
    headersToRemove.push(...cacheControlDirectives['no-cache'])
  }

  if (Array.isArray(cacheControlDirectives['private'])) {
    headersToRemove.push(...cacheControlDirectives['private'])
  }

  let strippedHeaders
  for (const headerName of headersToRemove) {
    if (resHeaders[headerName]) {
      strippedHeaders ??= { ...resHeaders }
      delete strippedHeaders[headerName]
    }
  }

  return strippedHeaders ?? resHeaders
}

/**
 * @param {Date} date
 * @returns {boolean}
 */
function isValidDate (date) {
  return date instanceof Date && Number.isFinite(date.valueOf())
}

module.exports = CacheHandler
module.exports.mergeValidationHeaders = mergeValidationHeaders
