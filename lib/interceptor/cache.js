'use strict'

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

  return dispatch => {
    return (opts, handler) => {
      if (!opts.origin) {
        // Not a method we want to cache or we don't have the origin, skip
        return dispatch(opts, handler)
      }

      const stream = store.createReadStream(opts)
      if (!stream) {
        // Request isn't cached
        return dispatch(opts, new CacheHandler(globalOpts, opts, handler))
      }

      let onErrorCalled = false

      /**
       * @param {import('../../types/cache-interceptor.d.ts').default.CacheStoreReadable} stream
       * @param {import('../../types/cache-interceptor.d.ts').default.CacheStoreValue} value
       */
      const respondWithCachedValue = (stream, value) => {
        const ac = new AbortController()
        const signal = ac.signal

        signal.onabort = (_, err) => {
          stream.destroy()
          if (!onErrorCalled) {
            handler.onError(err)
            onErrorCalled = true
          }
        }

        stream.on('error', (err) => {
          if (!onErrorCalled) {
            handler.onError(err)
            onErrorCalled = true
          }
        })

        try {
          if (typeof handler.onConnect === 'function') {
            handler.onConnect(ac.abort)
            signal.throwIfAborted()
          }

          if (typeof handler.onHeaders === 'function') {
            // Add the age header
            // https://www.rfc-editor.org/rfc/rfc9111.html#name-age
            const age = Math.round((Date.now() - value.cachedAt) / 1000)

            value.rawHeaders.push(AGE_HEADER, Buffer.from(`${age}`))

            handler.onHeaders(value.statusCode, value.rawHeaders, stream.resume, value.statusMessage)
            signal.throwIfAborted()
          }

          if (opts.method === 'HEAD') {
            if (typeof handler.onComplete === 'function') {
              handler.onComplete(null)
              stream.destroy()
            }
          } else {
            if (typeof handler.onData === 'function') {
              stream.on('data', chunk => {
                if (!handler.onData(chunk)) {
                  stream.pause()
                }
              })
            }

            if (typeof handler.onComplete === 'function') {
              stream.on('end', () => {
                handler.onComplete(value.rawTrailers ?? [])
              })
            }
          }
        } catch (err) {
          stream.destroy(err)
          if (!onErrorCalled && typeof handler.onError === 'function') {
            handler.onError(err)
            onErrorCalled = true
          }
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

        const { value } = stream

        // Dump body on error
        if (util.isStream(opts.body)) {
          opts.body?.on('error', () => {}).resume()
        }

        // Check if the response is stale
        const now = Date.now()
        if (now >= value.staleAt) {
          if (now >= value.deleteAt) {
            // Safety check in case the store gave us a response that should've been
            //  deleted already
            dispatch(opts, new CacheHandler(globalOpts, opts, handler))
            return
          }

          if (!opts.headers) {
            opts.headers = {}
          }

          opts.headers['if-modified-since'] = new Date(value.cachedAt).toUTCString()

          // Need to revalidate the response
          dispatch(
            opts,
            new CacheRevalidationHandler(
              () => respondWithCachedValue(stream, value),
              new CacheHandler(globalOpts, opts, handler)
            )
          )

          return
        }

        respondWithCachedValue(stream, value)
      }

      Promise.resolve(stream).then(handleStream).catch(handler.onError)

      return true
    }
  }
}
