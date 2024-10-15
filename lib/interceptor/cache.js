'use strict'

const util = require('../core/util')
const CacheHandler = require('../handler/cache-handler')
const MemoryCacheStore = require('../cache/memory-cache-store')
const CacheRevalidationHandler = require('../handler/cache-revalidation-handler')
const {
  UNSAFE_METHODS,
  assertCacheStoreType,
  parseCacheControlHeader
} = require('../util/cache.js')

const AGE_HEADER = Buffer.from('age')

/**
 * @param {import('../../types/dispatcher.d.ts').default.DispatchHandlers} handler
 */
function sendGatewayTimeout (handler) {
  const ac = new AbortController()
  const signal = ac.signal

  try {
    if (typeof handler.onConnect === 'function') {
      handler.onConnect(ac.abort)
      signal.throwIfAborted()
    }

    if (typeof handler.onHeaders === 'function') {
      handler.onHeaders(504, [], () => {}, 'Gateway Timeout')
      signal.throwIfAborted()
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
 * @param {number} now
 * @param {import('../../types/cache-interceptor.d.ts').default.CacheStoreValue} value
 * @param {number} age
 * @param {import('../util/cache.js').CacheControlDirectives} cacheControlDirectives
 */
function needsRevalidation (now, value, age, cacheControlDirectives) {
  if (cacheControlDirectives?.['no-cache']) {
    // Always revalidate requests with the no-cache parameter
    return true
  }

  if (now > value.staleAt) {
    // Response is stale
    if (cacheControlDirectives?.['max-stale']) {
      // https://www.rfc-editor.org/rfc/rfc9111.html#name-max-stale
      const gracePeriod = value.staleAt + (cacheControlDirectives['max-stale'] * 1000)
      return now > gracePeriod
    }

    return true
  }

  if (cacheControlDirectives?.['min-fresh']) {
    // https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.1.3
    const gracePeriod = age + (cacheControlDirectives['min-fresh'] * 1000)
    return (now - value.staleAt) > gracePeriod
  }

  return false
}

/**
 * @param {import('../../types/cache-interceptor.d.ts').default.CacheOptions | undefined} globalOpts
 * @returns {import('../../types/dispatcher.d.ts').default.DispatcherComposeInterceptor}
 */
module.exports = globalOpts => {
  if (!globalOpts) {
    globalOpts = {}
  }

  if (globalOpts.store) {
    assertCacheStoreType(globalOpts.store)
  } else {
    globalOpts.store = new MemoryCacheStore()
  }

  if (globalOpts.methods) {
    if (!Array.isArray(globalOpts.methods)) {
      throw new TypeError(`methods needs to be an array, got ${typeof globalOpts.methods}`)
    }

    if (globalOpts.methods.length === 0) {
      throw new Error('methods must have at least one method in it')
    }
  } else {
    globalOpts.methods = ['GET']
  }

  // Safe methods the user wants and unsafe methods
  const methods = [...globalOpts.methods, ...UNSAFE_METHODS]

  return dispatch => {
    return (opts, handler) => {
      if (!opts.origin || !methods.includes(opts.method)) {
        // Not a method we want to cache or we don't have the origin, skip
        return dispatch(opts, handler)
      }

      const requestCacheControl = opts.headers?.['cache-control']
        ? parseCacheControlHeader(opts.headers['cache-control'])
        : undefined

      if (requestCacheControl?.['no-store']) {
        return dispatch(opts, handler)
      }

      const stream = globalOpts.store.createReadStream(opts)
      if (!stream) {
        // Request isn't cached

        if (requestCacheControl?.['only-if-cached']) {
          // We only want cached responses
          //  https://www.rfc-editor.org/rfc/rfc9111.html#name-only-if-cached
          sendGatewayTimeout(handler)
          return true
        }

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

          if (requestCacheControl?.['only-if-cached']) {
            // We only want cached responses
            //  https://www.rfc-editor.org/rfc/rfc9111.html#name-only-if-cached
            sendGatewayTimeout(handler)
            return
          }

          return dispatch(opts, new CacheHandler(globalOpts, opts, handler))
        }

        const { value } = stream

        const now = Date.now()
        const age = Math.round((now - value.cachedAt) / 1000)
        if (requestCacheControl?.['max-age'] && age >= requestCacheControl['max-age']) {
          // Response is considered expired for this specific request
          //  https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.1.1
          dispatch(opts, handler)
          return
        }

        // Dump body on error
        if (util.isStream(opts.body)) {
          opts.body?.on('error', () => {}).resume()
        }

        // Check if the response is stale
        if (needsRevalidation(now, value, age, requestCacheControl)) {
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

      Promise.resolve(stream).then(handleStream).catch(err => handler.onError(err))

      return true
    }
  }
}
