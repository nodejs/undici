'use strict'

const assert = require('node:assert')
const { Readable } = require('node:stream')
const util = require('../core/util')
const CacheHandler = require('../handler/cache-handler')
const MemoryCacheStore = require('../cache/memory-cache-store')
const CacheRevalidationHandler = require('../handler/cache-revalidation-handler')
const { assertCacheStore, assertCacheMethods, makeCacheKey, parseCacheControlHeader } = require('../util/cache.js')
const { AbortError } = require('../core/errors.js')

/**
 * @param {import('../../types/dispatcher.d.ts').default.DispatchHandler} handler
 */
function sendGatewayTimeout (handler) {
  let aborted = false
  try {
    if (typeof handler.onConnect === 'function') {
      handler.onConnect(() => {
        aborted = true
      })

      if (aborted) {
        return
      }
    }

    if (typeof handler.onHeaders === 'function') {
      handler.onHeaders(504, [], () => {}, 'Gateway Timeout')
      if (aborted) {
        return
      }
    }

    if (typeof handler.onComplete === 'function') {
      handler.onComplete([])
    }
  } catch (err) {
    if (typeof handler.onError === 'function') {
      handler.onError(err)
    }
  }
}

/**
 * @param {import('../../types/cache-interceptor.d.ts').default.GetResult} result
 * @param {number} age
 * @param {import('../util/cache.js').CacheControlDirectives | undefined} cacheControlDirectives
 * @returns {boolean}
 */
function needsRevalidation (result, age, cacheControlDirectives) {
  if (cacheControlDirectives?.['no-cache']) {
    // Always revalidate requests with the no-cache directive
    return true
  }

  const now = Date.now()
  if (now > result.staleAt) {
    // Response is stale
    if (cacheControlDirectives?.['max-stale']) {
      // There's a threshold where we can serve stale responses, let's see if
      //  we're in it
      // https://www.rfc-editor.org/rfc/rfc9111.html#name-max-stale
      const gracePeriod = result.staleAt + (cacheControlDirectives['max-stale'] * 1000)
      return now > gracePeriod
    }

    return true
  }

  if (cacheControlDirectives?.['min-fresh']) {
    // https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.1.3

    // At this point, staleAt is always > now
    const timeLeftTillStale = result.staleAt - now
    const threshold = cacheControlDirectives['min-fresh'] * 1000

    return timeLeftTillStale <= threshold
  }

  return false
}

/**
 * @param {import('../../types/cache-interceptor.d.ts').default.CacheOptions} [opts]
 * @returns {import('../../types/dispatcher.d.ts').default.DispatcherComposeInterceptor}
 */
module.exports = (opts = {}) => {
  const {
    store = new MemoryCacheStore(),
    methods = ['GET']
  } = opts

  if (typeof opts !== 'object' || opts === null) {
    throw new TypeError(`expected type of opts to be an Object, got ${opts === null ? 'null' : typeof opts}`)
  }

  assertCacheStore(store, 'opts.store')
  assertCacheMethods(methods, 'opts.methods')

  const globalOpts = {
    store,
    methods
  }

  const safeMethodsToNotCache = util.safeHTTPMethods.filter(method => methods.includes(method) === false)

  return dispatch => {
    return (opts, handler) => {
      // TODO (fix): What if e.g. opts.headers has if-modified-since header? Or other headers
      // that make things ambigious?

      if (!opts.origin || safeMethodsToNotCache.includes(opts.method)) {
        // Not a method we want to cache or we don't have the origin, skip
        return dispatch(opts, handler)
      }

      const requestCacheControl = opts.headers?.['cache-control']
        ? parseCacheControlHeader(opts.headers['cache-control'])
        : undefined

      if (requestCacheControl?.['no-store']) {
        return dispatch(opts, handler)
      }

      /**
       * @type {import('../../types/cache-interceptor.d.ts').default.CacheKey}
       */
      const cacheKey = makeCacheKey(opts)

      // TODO (perf): For small entries support returning a Buffer instead of a stream.
      // Maybe store should return { staleAt, headers, body, etc... } instead of a stream + stream.value?
      // Where body can be a Buffer, string, stream or blob?
      const result = store.get(cacheKey)
      if (!result) {
        if (requestCacheControl?.['only-if-cached']) {
          // We only want cached responses
          //  https://www.rfc-editor.org/rfc/rfc9111.html#name-only-if-cached
          sendGatewayTimeout(handler)
          return true
        }

        return dispatch(opts, new CacheHandler(globalOpts, cacheKey, handler))
      }

      /**
       * @param {import('../../types/cache-interceptor.d.ts').default.GetResult} result
       * @param {number} age
       */
      const respondWithCachedValue = ({ headers, statusCode, statusMessage, body }, age, context) => {
        const stream = util.isStream(body)
          ? body
          : Readable.from(body ?? [])

        assert(!stream.destroyed, 'stream should not be destroyed')
        assert(!stream.readableDidRead, 'stream should not be readableDidRead')

        const controller = {
          resume () {
            stream.resume()
          },
          pause () {
            stream.pause()
          },
          get paused () {
            return stream.isPaused()
          },
          get aborted () {
            return stream.destroyed
          },
          get reason () {
            return stream.errored
          },
          abort (reason) {
            stream.destroy(reason ?? new AbortError())
          }
        }

        stream
          .on('error', function (err) {
            if (!this.readableEnded) {
              if (typeof handler.onResponseError === 'function') {
                handler.onResponseError(controller, err)
              } else {
                throw err
              }
            }
          })
          .on('close', function () {
            if (!this.errored) {
              handler.onResponseEnd?.(controller, {})
            }
          })

        handler.onRequestStart?.(controller, context)

        if (stream.destroyed) {
          return
        }

        // Add the age header
        // https://www.rfc-editor.org/rfc/rfc9111.html#name-age
        // TODO (fix): What if headers.age already exists?
        headers = age != null ? { ...headers, age: String(age) } : headers

        handler.onResponseStart?.(controller, statusCode, statusMessage, headers)

        if (opts.method === 'HEAD') {
          stream.destroy()
        } else {
          stream.on('data', function (chunk) {
            handler.onResponseData?.(controller, chunk)
          })
        }
      }

      /**
       * @param {import('../../types/cache-interceptor.d.ts').default.GetResult} result
       */
      const handleResult = (result) => {
        // TODO (perf): Readable.from path can be optimized...

        if (!result.body && opts.method !== 'HEAD') {
          throw new Error('stream is undefined but method isn\'t HEAD')
        }

        const age = Math.round((Date.now() - result.cachedAt) / 1000)
        if (requestCacheControl?.['max-age'] && age >= requestCacheControl['max-age']) {
          // Response is considered expired for this specific request
          //  https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.1.1
          return dispatch(opts, handler)
        }

        // Check if the response is stale
        if (needsRevalidation(result, age, requestCacheControl)) {
          if (util.isStream(opts.body) && util.bodyLength(opts.body) !== 0) {
            // If body is is stream we can't revalidate...
            // TODO (fix): This could be less strict...
            return dispatch(opts, new CacheHandler(globalOpts, cacheKey, handler))
          }

          // We need to revalidate the response
          return dispatch(
            {
              ...opts,
              headers: {
                ...opts.headers,
                'if-modified-since': new Date(result.cachedAt).toUTCString(),
                etag: result.etag
              }
            },
            new CacheRevalidationHandler(
              (success, context) => {
                if (success) {
                  respondWithCachedValue(result, age, context)
                } else if (util.isStream(result.body)) {
                  result.body.on('error', () => {}).destroy()
                }
              },
              new CacheHandler(globalOpts, cacheKey, handler)
            )
          )
        }

        // Dump request body.
        if (util.isStream(opts.body)) {
          opts.body.on('error', () => {}).destroy()
        }

        respondWithCachedValue(result, age, null)
      }

      if (typeof result.then === 'function') {
        result.then((result) => {
          if (!result) {
            if (requestCacheControl?.['only-if-cached']) {
              // We only want cached responses
              //  https://www.rfc-editor.org/rfc/rfc9111.html#name-only-if-cached
              sendGatewayTimeout(handler)
              return true
            }

            dispatch(opts, new CacheHandler(globalOpts, cacheKey, handler))
          } else {
            handleResult(result)
          }
        }, err => {
          if (typeof handler.onError === 'function') {
            handler.onError(err)
          } else {
            throw err
          }
        })
      } else {
        handleResult(result)
      }

      return true
    }
  }
}
