'use strict'

const CacheHandler = require('../handler/cache-handler')
const MemoryCacheStore = require('../cache/memory-cache-store')
const CacheRevalidationHandler = require('../handler/cache-revalidation-handler')
const { UNSAFE_METHODS, parseCacheControlHeader } = require('../util/cache.js')

const AGE_HEADER = Buffer.from('age')

/**
 * @param {number} now
 * @param {import('../../types/cache-interceptor.d.ts').default.CacheStoreValue} value
 * @param {number} age
 * @param {import('../util/cache.js').CacheControlDirectives} cacheControlDirectives
 */
function needsRevalidation (now, value, age, cacheControlDirectives) {
  if (now > value.staleAt) {
    // Response is stale
    if (cacheControlDirectives?.['max-stale']) {
      // Check if the request doesn't mind a stale response
      // https://www.rfc-editor.org/rfc/rfc9111.html#name-max-stale
      const gracePeriod = value.staleAt + (cacheControlDirectives['max-stale'] * 1000)

      return now > gracePeriod
    }

    return true
  }

  if (cacheControlDirectives?.['no-cache']) {
    // Always revalidate request with the no-cache parameter
    return true
  }

  if (
    cacheControlDirectives &&
    cacheControlDirectives['max-age'] !== undefined &&
    cacheControlDirectives['max-stale'] !== undefined
  ) {
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
    for (const fn of ['createReadStream', 'createWriteStream', 'deleteByOrigin']) {
      if (typeof globalOpts.store[fn] !== 'function') {
        throw new TypeError(`CacheStore needs a \`${fn}()\` function`)
      }
    }

    if (typeof globalOpts.store.isFull !== 'boolean') {
      throw new TypeError(`CacheStore needs a isFull getter with type boolean, current type: ${typeof globalOpts.store.isFull}`)
    }
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
      const requestCacheControl = opts.headers?.['cache-control']
        ? parseCacheControlHeader(opts.headers['cache-control'])
        : undefined

      if (
        !opts.origin ||
        !methods.includes(opts.method) ||
        requestCacheControl?.['no-store']
      ) {
        // Not a method we want to cache or we don't have the origin, skip
        return dispatch(opts, handler)
      }

      const stream = globalOpts.store.createReadStream(opts)
      if (!stream) {
        // Request isn't cached
        if (requestCacheControl?.['only-if-cached']) {
          const ac = new AbortController()
          const signal = ac.signal

          // We only want cached responses
          //  https://www.rfc-editor.org/rfc/rfc9111.html#name-only-if-cached
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

        // Dispatch it and add it to the cache
        return dispatch(opts, new CacheHandler(globalOpts, opts, handler))
      }

      const { value } = stream

      const age = Math.round((Date.now() - value.cachedAt) / 1000)
      if (requestCacheControl?.['max-age'] && age >= requestCacheControl['max-age']) {
        // Response is considered expired for this specific request
        //  https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.1.1
        // TODO we could also pass this to the cache handler to re-cache this if we want
        return dispatch(opts, handler)
      }

      // Dump body on error
      if (typeof opts.body === 'object' && opts.body.constructor.name === 'Readable') {
        opts.body?.on('error', () => {}).resume()
      }

      const respondWithCachedValue = () => {
        const ac = new AbortController()
        const signal = ac.signal

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
            }
          } else {
            if (typeof handler.onData === 'function') {
              stream.on('data', chunk => {
                while (!handler.onData(chunk)) {
                  signal.throwIfAborted()
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
          if (typeof handler.onError === 'function') {
            handler.onError(err)
          }
        }
      }

      // Check if the response needs revalidation
      // Reasons for this,
      //  1) the response is stale
      //  2) the request gives the no-cache directive
      //  3)
      const now = Date.now()

      if (needsRevalidation(now, value, age, requestCacheControl)) {
        if (now > value.deleteAt) {
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
            respondWithCachedValue,
            new CacheHandler(globalOpts, opts, handler)
          )
        )

        return
      }

      respondWithCachedValue()

      return true
    }
  }
}
