'use strict'

const assert = require('node:assert')
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
   * @type {((boolean) => void) | null}
   */
  #callback
  /**
   * @type {(import('../../types/dispatcher.d.ts').default.DispatchHandlers)}
   */
  #handler

  #abort
  /**
   * @param {(boolean) => void} callback Function to call if the cached value is valid
   * @param {import('../../types/dispatcher.d.ts').default.DispatchHandlers} handler
   */
  constructor (callback, handler) {
    if (typeof callback !== 'function') {
      throw new TypeError('callback must be a function')
    }

    super(handler)

    this.#callback = callback
    this.#handler = handler
  }

  onConnect (abort) {
    this.#successful = false
    this.#abort = abort
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
    assert(this.#callback != null)

    // https://www.rfc-editor.org/rfc/rfc9111.html#name-handling-a-validation-respo
    this.#successful = statusCode === 304
    this.#callback(this.#successful)
    this.#callback = null

    if (this.#successful) {
      return true
    }

    if (typeof this.#handler.onConnect === 'function') {
      this.#handler.onConnect(this.#abort)
    }

    if (typeof this.#handler.onHeaders === 'function') {
      return this.#handler.onHeaders(
        statusCode,
        rawHeaders,
        resume,
        statusMessage
      )
    }

    return true
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

    return true
  }

  /**
   * @see {DispatchHandlers.onComplete}
   *
   * @param {string[] | null} rawTrailers
   */
  onComplete (rawTrailers) {
    if (this.#successful) {
      return
    }

    if (typeof this.#handler.onComplete === 'function') {
      this.#handler.onComplete(rawTrailers)
    }
  }

  /**
   * @see {DispatchHandlers.onError}
   *
   * @param {Error} err
   */
  onError (err) {
    if (this.#successful) {
      return
    }

    if (this.#callback) {
      this.#callback(false)
      this.#callback = null
    }

    if (typeof this.#handler.onError === 'function') {
      this.#handler.onError(err)
    } else {
      throw err
    }
  }
}

module.exports = CacheRevalidationHandler
