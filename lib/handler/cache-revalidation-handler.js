'use strict'

const DecoratorHandler = require('../handler/decorator-handler')

/**
 * This takes care of revalidation requests we send to the origin. If we get
 *  a response indicating that what we have is cached (via a HTTP 304), we can
 *  continue using the cached value. Otherwise, we'll receive the new response
 *  here, which we then just pass on to the next handler (most likely a
 *  CacheHandler). Note that this assumes the proper headers were already
 *  included in the request to tell the origin that we want to revalidate the
 *  response (i.e. if-modified-since).
 *
 * @see https://www.rfc-editor.org/rfc/rfc9111.html#name-validation
 *
 * @typedef {import('../../types/dispatcher.d.ts').default.DispatchHandlers} DispatchHandlers
 * @implements {DispatchHandlers}
 */
class CacheRevalidationHandler extends DecoratorHandler {
  #successful = false
  /**
   * @type {(() => void)}
   */
  #successCallback
  /**
   * @type {(import('../../types/dispatcher.d.ts').default.DispatchHandlers)}
   */
  #handler

  /**
   * @param {() => void} successCallback Function to call if the cached value is valid
   * @param {import('../../types/dispatcher.d.ts').default.DispatchHandlers} handler
   */
  constructor (successCallback, handler) {
    if (typeof successCallback !== 'function') {
      throw new TypeError('successCallback must be a function')
    }

    super(handler)

    this.#successCallback = successCallback
    this.#handler = handler
  }

  /**
   * @see {DispatchHandlers.onHeaders}
   *
   * @param {number} statusCode
   * @param {Buffer[]} rawHeaders
   * @param {() => void} resume
   * @param {string} statusMessage
   * @returns {boolean}
   */
  onHeaders (
    statusCode,
    rawHeaders,
    resume,
    statusMessage
  ) {
    // https://www.rfc-editor.org/rfc/rfc9111.html#name-handling-a-validation-respo
    if (statusCode === 304) {
      this.#successful = true
      this.#successCallback()
      return true
    }

    if (typeof this.#handler.onHeaders === 'function') {
      return this.#handler.onHeaders(
        statusCode,
        rawHeaders,
        resume,
        statusMessage
      )
    }
    return false
  }

  /**
   * @see {DispatchHandlers.onData}
   *
   * @param {Buffer} chunk
   * @returns {boolean}
   */
  onData (chunk) {
    if (this.#successful) {
      return true
    }

    if (typeof this.#handler.onData === 'function') {
      return this.#handler.onData(chunk)
    }

    return false
  }

  /**
   * @see {DispatchHandlers.onComplete}
   *
   * @param {string[] | null} rawTrailers
   */
  onComplete (rawTrailers) {
    if (!this.#successful && typeof this.#handler.onComplete === 'function') {
      this.#handler.onComplete(rawTrailers)
    }
  }

  /**
   * @see {DispatchHandlers.onError}
   *
   * @param {Error} err
   */
  onError (err) {
    if (typeof this.#handler.onError === 'function') {
      this.#handler.onError(err)
    }
  }
}

module.exports = CacheRevalidationHandler
