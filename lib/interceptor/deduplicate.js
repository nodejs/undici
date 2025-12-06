'use strict'

const diagnosticsChannel = require('node:diagnostics_channel')
const util = require('../core/util')
const DeduplicationHandler = require('../handler/deduplication-handler')
const { normalizeHeaders, makeCacheKey, makeDeduplicationKey } = require('../util/cache.js')

const pendingRequestsChannel = diagnosticsChannel.channel('undici:request:pending-requests')

/**
 * @param {import('../../types/interceptors.d.ts').default.DeduplicateInterceptorOpts} [opts]
 * @returns {import('../../types/dispatcher.d.ts').default.DispatcherComposeInterceptor}
 */
module.exports = (opts = {}) => {
  const {
    methods = ['GET']
  } = opts

  if (typeof opts !== 'object' || opts === null) {
    throw new TypeError(`expected type of opts to be an Object, got ${opts === null ? 'null' : typeof opts}`)
  }

  if (!Array.isArray(methods)) {
    throw new TypeError(`expected opts.methods to be an array, got ${typeof methods}`)
  }

  for (const method of methods) {
    if (!util.safeHTTPMethods.includes(method)) {
      throw new TypeError(`expected opts.methods to only contain safe HTTP methods, got ${method}`)
    }
  }

  const safeMethodsToNotDeduplicate = util.safeHTTPMethods.filter(method => methods.includes(method) === false)

  /**
   * Map of pending requests for deduplication
   * @type {Map<string, DeduplicationHandler>}
   */
  const pendingRequests = new Map()

  return dispatch => {
    return (opts, handler) => {
      if (!opts.origin || safeMethodsToNotDeduplicate.includes(opts.method)) {
        return dispatch(opts, handler)
      }

      opts = {
        ...opts,
        headers: normalizeHeaders(opts)
      }

      const cacheKey = makeCacheKey(opts)
      const dedupeKey = makeDeduplicationKey(cacheKey)

      // Check if there's already a pending request for this key
      const pendingHandler = pendingRequests.get(dedupeKey)
      if (pendingHandler) {
        // Add this handler to the waiting list
        pendingHandler.addWaitingHandler(handler)
        return true
      }

      // Create a new deduplication handler
      const deduplicationHandler = new DeduplicationHandler(
        handler,
        () => {
          // Clean up when request completes
          pendingRequests.delete(dedupeKey)
          if (pendingRequestsChannel.hasSubscribers) {
            pendingRequestsChannel.publish({ size: pendingRequests.size, key: dedupeKey, type: 'removed' })
          }
        }
      )

      // Register the pending request
      pendingRequests.set(dedupeKey, deduplicationHandler)
      if (pendingRequestsChannel.hasSubscribers) {
        pendingRequestsChannel.publish({ size: pendingRequests.size, key: dedupeKey, type: 'added' })
      }

      return dispatch(opts, deduplicationHandler)
    }
  }
}
