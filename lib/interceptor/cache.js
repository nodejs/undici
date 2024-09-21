'use strict'

const CacheHandler = require('../handler/cache-handler')
const MemoryCacheStore = require('../cache/memory-cache-store')
const CacheRevalidationHandler = require('../handler/cache-revalidation-handler')
const { UNSAFE_METHODS } = require('../util/cache.js')

const AGE_HEADER = Buffer.from('age')

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
      if (!opts.origin || !methods.includes(opts.method)) {
        // Not a method we want to cache or we don't have the origin, skip
        return dispatch(opts, handler)
      }

      const stream = globalOpts.store.createReadStream(opts)
      if (!stream) {
        // Request isn't cached
        return dispatch(opts, new CacheHandler(globalOpts, opts, handler))
      }

      const { value } = stream

      // Dump body on error
      if (typeof opts.body === 'object' && opts.body.constructor.name === 'Readable') {
        opts.body?.on('error', () => {}).resume()
      }

      const respondWithCachedValue = () => {
        const ac = new AbortController()
        const signal = ac.signal

        try {
          console.log(' on conn')
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

      // Check if the response is stale
      const now = Date.now()
      if (now > value.staleAt) {
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
