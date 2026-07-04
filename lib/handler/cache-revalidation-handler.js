'use strict'

const assert = require('node:assert')

/**
 * This takes care of revalidation requests we send to the origin. If we get
 *  a response indicating that what we have is cached (via a HTTP 304), we can
 *  continue using the cached value. Otherwise, we'll receive the new response
 *  here, which we then just pass on to the next handler (most likely a
 *  CacheHandler). Note that this assumes the proper headers were already
 *  included in the request to tell the origin that we want to revalidate the
 *  response (i.e. if-modified-since or if-none-match).
 *
 * @see https://www.rfc-editor.org/rfc/rfc9111.html#name-validation
 *
 * @implements {import('../../types/dispatcher.d.ts').default.DispatchHandler}
 */
class CacheRevalidationHandler {
  #successful = false

  /**
   * Whether we're forwarding a 304 response to the cache update handler
   * @type {boolean}
   */
  #updatingCache = false

  /**
   * @type {((success: boolean, context: any, statusCode?: number, headers?: Record<string, string | string[]>) => void) | null}
   */
  #callback

  /**
   * @type {(import('../../types/dispatcher.d.ts').default.DispatchHandler)}
   */
  #handler

  /**
   * Handler that updates the stored response with a 304's headers
   *  (https://www.rfc-editor.org/rfc/rfc9111.html#name-freshening-stored-responses)
   * @type {import('../../types/dispatcher.d.ts').default.DispatchHandler | null}
   */
  #cacheUpdateHandler

  #context

  /**
   * @type {boolean}
   */
  #allowErrorStatusCodes

  /**
   * @param {(success: boolean, context: any, statusCode?: number, headers?: Record<string, string | string[]>) => void} callback Function to call if the cached value is valid
   * @param {import('../../types/dispatcher.d.ts').default.DispatchHandlers} handler
   * @param {boolean} allowErrorStatusCodes
   * @param {import('../../types/dispatcher.d.ts').default.DispatchHandler} [cacheUpdateHandler]
   */
  constructor (callback, handler, allowErrorStatusCodes, cacheUpdateHandler = null) {
    if (typeof callback !== 'function') {
      throw new TypeError('callback must be a function')
    }

    this.#callback = callback
    this.#handler = handler
    this.#allowErrorStatusCodes = allowErrorStatusCodes
    this.#cacheUpdateHandler = cacheUpdateHandler
  }

  onRequestStart (_, context) {
    this.#successful = false
    this.#updatingCache = false
    this.#context = context
  }

  onRequestUpgrade (controller, statusCode, headers, socket) {
    this.#handler.onRequestUpgrade?.(controller, statusCode, headers, socket)
  }

  onResponseStart (
    controller,
    statusCode,
    headers,
    statusMessage
  ) {
    assert(this.#callback != null)

    // https://www.rfc-editor.org/rfc/rfc9111.html#name-handling-a-validation-respo
    // https://datatracker.ietf.org/doc/html/rfc5861#section-4
    this.#successful = statusCode === 304 ||
      (this.#allowErrorStatusCodes && statusCode >= 500 && statusCode <= 504)
    this.#callback(this.#successful, this.#context, statusCode, headers)
    this.#callback = null

    if (this.#successful) {
      if (statusCode === 304 && this.#cacheUpdateHandler) {
        // Let the cache update handler freshen the stored response with the
        //  headers of the validation response
        //  https://www.rfc-editor.org/rfc/rfc9111.html#name-freshening-stored-responses
        this.#updatingCache = true
        this.#cacheUpdateHandler.onRequestStart?.(controller, this.#context)
        this.#cacheUpdateHandler.onResponseStart?.(
          controller,
          statusCode,
          headers,
          statusMessage
        )
      }

      return true
    }

    this.#handler.onRequestStart?.(controller, this.#context)
    this.#handler.onResponseStart?.(
      controller,
      statusCode,
      headers,
      statusMessage
    )
  }

  onResponseData (controller, chunk) {
    if (this.#successful) {
      if (this.#updatingCache) {
        this.#cacheUpdateHandler.onResponseData?.(controller, chunk)
      }
      return
    }

    return this.#handler.onResponseData?.(controller, chunk)
  }

  onResponseEnd (controller, trailers) {
    if (this.#successful) {
      if (this.#updatingCache) {
        this.#cacheUpdateHandler.onResponseEnd?.(controller, trailers)
      }
      return
    }

    this.#handler.onResponseEnd?.(controller, trailers)
  }

  onResponseError (controller, err) {
    if (this.#successful) {
      if (this.#updatingCache) {
        this.#cacheUpdateHandler.onResponseError?.(controller, err)
      }
      return
    }

    if (this.#callback) {
      this.#callback(false)
      this.#callback = null
    }

    if (typeof this.#handler.onResponseError === 'function') {
      this.#handler.onResponseError(controller, err)
    } else {
      throw err
    }
  }
}

module.exports = CacheRevalidationHandler
