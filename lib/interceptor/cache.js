'use strict'

const assert = require('node:assert')
const util = require('../core/util')
const CacheHandler = require('../handler/cache-handler')
const MemoryCacheStore = require('../cache/memory-cache-store')
const CacheRevalidationHandler = require('../handler/cache-revalidation-handler')
const { assertCacheStore, assertCacheMethods } = require('../util/cache.js')

const AGE_HEADER = Buffer.from('age')

/**
 * @typedef {import('../../types/cache-interceptor.d.ts').default.CacheStoreValue} CacheStoreValue
 */

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
      if (!opts.origin || safeMethodsToNotCache.includes(opts.method)) {
        // Not a method we want to cache or we don't have the origin, skip
        return dispatch(opts, handler)
      }

      // TODO (perf): For small entries support returning a Buffer instead of a stream.
      const stream = store.createReadStream(opts)
      if (!stream) {
        // Request isn't cached
        return dispatch(opts, new CacheHandler(globalOpts, opts, handler))
      }

      /**
       * @param {import('node:stream').Readable} stream
       * @param {import('../../types/cache-interceptor.d.ts').default.CacheStoreValue} value
       */
      const respondWithCachedValue = (stream, value) => {
        assert(!stream.destroyed, 'stream should not be destroyed')
        assert(!stream.readableDidRead, 'stream should not be readableDidRead')

        try {
          stream
            .on('error', function (err) {
              if (!this.readableEnded) {
                if (typeof handler.onError === 'function') {
                  handler.onError(err)
                } else {
                  throw err
                }
              }
            })
            .on('close', function () {
              if (!this.errored && typeof handler.onComplete === 'function') {
                handler.onComplete(value.rawTrailers ?? [])
              }
            })

          if (typeof handler.onConnect === 'function') {
            handler.onConnect((err) => {
              stream.destroy(err)
            })
            if (stream.destroyed) {
              return
            }
          }

          if (typeof handler.onHeaders === 'function') {
            // Add the age header
            // https://www.rfc-editor.org/rfc/rfc9111.html#name-age
            const age = Math.round((Date.now() - value.cachedAt) / 1000)

            value.rawHeaders.push(AGE_HEADER, Buffer.from(`${age}`))

            if (handler.onHeaders(value.statusCode, value.rawHeaders, () => stream.resume(), value.statusMessage) === false) {
              stream.pause()
            }
          }

          if (opts.method === 'HEAD') {
            stream.destroy()
          } else {
            stream.on('data', function (chunk) {
              if (typeof handler.onData === 'function' && !handler.onData(chunk)) {
                stream.pause()
              }
            })
          }
        } catch (err) {
          stream.destroy(err)
        }
      }

      /**
       * @param {import('node:stream').Readable & { value: CacheStoreValue } | undefined} stream
       */
      const handleStream = (stream) => {
        if (!stream) {
          return dispatch(opts, new CacheHandler(globalOpts, opts, handler))
        }

        assert(util.isStream(stream))

        // TODO (fix): It's weird that "value" lives on stream.
        const { value } = stream

        try {
          // Check if the response is stale
          const now = Date.now()
          if (now < value.staleAt) {
            // Dump body.
            if (util.isStream(opts.body)) {
              opts.body.on('error', () => {}).resume()
            }
            respondWithCachedValue(stream, value)
          } else if (util.isStream(opts.body) && util.bodyLength(opts.body) !== 0) {
            // If body is is stream we can't revalidate...
            // TODO (fix): This could be less strict...
            dispatch(opts, new CacheHandler(globalOpts, opts, handler))
          } else {
            // Need to revalidate the response
            dispatch(
              {
                ...opts,
                headers: {
                  ...opts.headers,
                  'if-modified-since': new Date(value.cachedAt).toUTCString()
                }
              },
              new CacheRevalidationHandler(
                () => respondWithCachedValue(stream, value),
                new CacheHandler(globalOpts, opts, handler)
              )
            )
          }
        } catch (err) {
          if (typeof handler.onError === 'function') {
            handler.onError(err)
          } else {
            throw err
          }
        }
      }

      if (util.isStream(stream)) {
        handleStream(stream)
      } else {
        Promise.resolve(stream).then(handleStream, err => {
          if (typeof handler.onError === 'function') {
            handler.onError(err)
          } else {
            throw err
          }
        })
      }

      return true
    }
  }
}
