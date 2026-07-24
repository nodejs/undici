'use strict'

const { InvalidArgumentError, RequestAbortedError } = require('../core/errors')
const { addAbortListener } = require('../core/util')
const DecoratorHandler = require('../handler/decorator-handler')

class SignalHandler extends DecoratorHandler {
  /** @type {AbortSignal|import('node:events').EventEmitter} */
  #signal
  /** @type {import('../core/request').RequestController|null} */
  #controller = null
  /** @type {(() => void)|null} */
  #removeAbortListener = null
  /** @type {boolean} */
  #aborted = false

  constructor (signal, handler) {
    super(handler)
    this.#signal = signal
  }

  #abort () {
    this.#aborted = true
    this.#removeListener()
    this.#controller.abort(this.#signal.reason ?? new RequestAbortedError())
  }

  #removeListener () {
    if (this.#removeAbortListener !== null) {
      this.#removeAbortListener()
      this.#removeAbortListener = null
    }
  }

  onRequestStart (controller, context) {
    // A fresh controller is passed for every dispatch of the same request
    // (e.g. when composed with the retry interceptor), so keep the reference
    // up to date while registering the abort listener only once.
    this.#controller = controller

    if (this.#aborted || this.#signal.aborted) {
      this.#abort()
      return
    }

    if (this.#removeAbortListener === null) {
      this.#removeAbortListener = addAbortListener(this.#signal, () => this.#abort())
    }

    super.onRequestStart(controller, context)
  }

  onRequestUpgrade (controller, statusCode, headers, socket) {
    this.#removeListener()
    super.onRequestUpgrade(controller, statusCode, headers, socket)
  }

  onResponseEnd (controller, trailers) {
    this.#removeListener()
    super.onResponseEnd(controller, trailers)
  }

  onResponseError (controller, err) {
    this.#removeListener()
    super.onResponseError(controller, err)
  }
}

/**
 * Interceptor that aborts the request when the `signal` dispatch option is
 * aborted. Supports both `AbortSignal` and `EventEmitter`-style signals.
 * The abort listener is removed once the request completes, errors or is
 * upgraded.
 *
 * @returns {import('../../types/dispatcher').default.DispatcherComposeInterceptor}
 */
module.exports = () => {
  return (dispatch) => {
    return function signalInterceptor (opts, handler) {
      const { signal } = opts

      if (!signal) {
        return dispatch(opts, handler)
      }

      if (typeof signal.on !== 'function' && typeof signal.addEventListener !== 'function') {
        throw new InvalidArgumentError('signal must be an EventEmitter or EventTarget')
      }

      return dispatch(opts, new SignalHandler(signal, handler))
    }
  }
}
