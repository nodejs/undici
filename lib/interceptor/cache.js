'use strict'

const CacheHandler = require('../handler/cache-handler')
const MemoryCacheStore = require('../cache/memory-cache-store')
const CacheRevalidationHandler = require('../handler/cache-revalidation-handler')

/**
 * Gives the downstream handler the request's cached response or dispatches
 *  it if it isn't cached
 * @param {import('../../types/cache-interceptor.d.ts').default.CacheOptions} globalOpts
 * @param {*} dispatch TODO type
 * @param {import('../../types/dispatcher.d.ts').default.RequestOptions} opts
 * @param {import('../../types/dispatcher.d.ts').default.DispatchHandlers} handler
 * @param {import('../../types/cache-interceptor.d.ts').default.CacheStoreValue | undefined} value
 */
function handleCachedResult (
  globalOpts,
  dispatch,
  opts,
  handler,
  value
) {
  if (!value) {
    // Request isn't cached, let's continue dispatching it
    dispatch(opts, new CacheHandler(globalOpts, opts, handler))
    return
  }

  // Dump body on error
  opts.body?.on('error', () => {}).resume()

  const respondWithCachedValue = () => {
    const ac = new AbortController()
    const signal = ac.signal

    try {
      handler.onConnect(ac.abort)
      signal.throwIfAborted()

      // Add the age header
      // https://www.rfc-editor.org/rfc/rfc9111.html#name-age
      const age = Math.round((Date.now() - value.cachedAt) / 1000)

      // Copy the headers in case we got this from an in-memory store. We don't
      //  want to modify the original response.
      const headers = [...value.rawHeaders]
      headers.push(Buffer.from('age'), Buffer.from(`${age}`))

      handler.onHeaders(value.statusCode, headers, () => {}, value.statusMessage)
      signal.throwIfAborted()

      if (opts.method === 'HEAD') {
        handler.onComplete([])
      } else {
        for (const chunk of value.body) {
          while (!handler.onData(chunk)) {
            signal.throwIfAborted()
          }
        }

        handler.onComplete(value.rawTrailers ?? null)
      }
    } catch (err) {
      handler.onError(err)
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

  // Response is still fresh, let's return it
  respondWithCachedValue()
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
    for (const fn of ['get', 'put']) {
      if (typeof globalOpts.store[fn] !== 'function') {
        throw new Error(`CacheStore needs a \`${fn}()\` function`)
      }
    }

    for (const getter of ['entryCount', 'maxEntries', 'maxEntrySize']) {
      const actualType = typeof globalOpts.store[getter]
      if (actualType !== 'number') {
        throw new Error(`CacheStore needs a ${getter} property with type number, current type: ${actualType}`)
      }
    }

    for (const value of ['maxEntries', 'maxEntry']) {
      if (globalOpts.store[value] <= 0) {
        throw new Error(`CacheStore ${value} needs to be >= 1`)
      }
    }
  } else {
    globalOpts.store = new MemoryCacheStore()
  }

  if (!globalOpts.methods) {
    globalOpts.methods = ['GET']
  }

  return dispatch => {
    return (opts, handler) => {
      if (!globalOpts.methods.includes(opts.method)) {
        // Not a method we want to cache, skip
        return dispatch(opts, handler)
      }

      const result = globalOpts.store.get(opts)
      if (result && result.constructor.name === 'Promise') {
        result.then(value => {
          handleCachedResult(
            globalOpts,
            dispatch,
            opts,
            handler,
            value
          )
        }).catch(handler.onError)
      } else {
        handleCachedResult(
          globalOpts,
          dispatch,
          opts,
          handler,
          result
        )
      }

      return true
    }
  }
}
