'use strict'

const assert = require('node:assert')
const util = require('../core/util')
const CacheHandler = require('../handler/cache-handler')
const MemoryCacheStore = require('../cache/memory-cache-store')
const CacheRevalidationHandler = require('../handler/cache-revalidation-handler')
const { assertCacheStore, assertCacheMethods } = require('../util/cache.js')

const AGE_HEADER = Buffer.from('age')

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
       * @param {import('../../types/cache-interceptor.d.ts').default.CacheStoreReadable} stream
       * @param {import('../../types/cache-interceptor.d.ts').default.CacheStoreValue} value
       */
      const respondWithCachedValue = (stream, value) => {
        let completed = false

        assert(!stream.destroyed, 'stream should not be destroyed')
        assert(!stream.readableDidRead, 'stream should not be readableDidRead')

        stream.on('error', (err) => {
          if (!completed && typeof handler.onError === 'function') {
            handler.onError(err)
          }
        })

        try {
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

            handler.onHeaders(value.statusCode, value.rawHeaders, () => stream.resume(), value.statusMessage)
            if (stream.destroyed) {
              return
            }
          }

          if (opts.method === 'HEAD') {
            if (typeof handler.onComplete === 'function') {
              completed = true
              handler.onComplete(null)
            }
            stream.destroy()
          } else {
            stream.on('data', chunk => {
              if (typeof handler.onData === 'function' && !handler.onData(chunk)) {
                stream.pause()
              }
            })

            stream.on('end', () => {
              if (typeof handler.onComplete === 'function') {
                handler.onComplete(value.rawTrailers ?? [])
              }
            })
          }
        } catch (err) {
          stream.destroy(err)
        }
      }

      /**
       * @param {import('../../types/cache-interceptor.d.ts').default.CacheStoreReadable | undefined} stream
       */
      const handleStream = (stream) => {
        if (!stream) {
          // Request isn't cached
          return dispatch(opts, new CacheHandler(globalOpts, opts, handler))
        }

        // TODO (fix): It's weird that "value" lives on stream.
        const { value } = stream

        // Dump body if cached...
        // TODO (fix): This is a bit suspect.
        if (util.isStream(opts.body)) {
          opts.body?.on('error', () => {}).resume()
        }

        // Check if the response is stale
        const now = Date.now()
        if (now >= value.staleAt) {
          // TODO (fix): This whole bit is a bit suspect. In particular given that
          // we dumped the body above.

          if (now >= value.deleteAt) {
            // Safety check in case the store gave us a response that should've been
            // deleted already
            return dispatch(opts, new CacheHandler(globalOpts, opts, handler))
          }

          if (!opts.headers) {
            opts.headers = {}
          }

          opts.headers['if-modified-since'] = new Date(value.cachedAt).toUTCString()

          // Need to revalidate the response
          return dispatch(
            opts,
            new CacheRevalidationHandler(
              () => respondWithCachedValue(stream, value),
              new CacheHandler(globalOpts, opts, handler)
            )
          )
        }

        respondWithCachedValue(stream, value)
      }

      Promise.resolve(stream).then(handleStream, err => {
        if (typeof handler.onError === 'function') {
          handler.onError(err)
        }
      })

      return true
    }
  }
}
