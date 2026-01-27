'use strict'

const { RequestAbortedError } = require('../core/errors')
const DecoratorHandler = require('../handler/decorator-handler')

class SignalHandler extends DecoratorHandler {
  #signal
  #listener
  #controller
  #aborted = false

  constructor ({ signal }, { handler }) {
    super(handler)
    this.#signal = signal
    this.#listener = null
    this.#controller = null
  }

  onRequestStart (controller, context) {
    this.#controller = controller

    if (!this.#signal) {
      return super.onRequestStart(controller, context)
    }

    if (this.#signal.aborted) {
      this.#abort()
      return
    }

    this.#listener = () => {
      this.#abort()
    }

    if ('addEventListener' in this.#signal) {
      this.#signal.addEventListener('abort', this.#listener)
    } else {
      this.#signal.on('abort', this.#listener)
    }

    return super.onRequestStart(controller, context)
  }

  #abort () {
    if (this.#aborted) return
    this.#aborted = true

    const reason = this.#signal?.reason ?? new RequestAbortedError()
    if (this.#controller) {
      this.#controller.abort(reason)
    }
    this.#removeSignal()
  }

  #removeSignal () {
    if (!this.#signal || !this.#listener) {
      return
    }

    if ('removeEventListener' in this.#signal) {
      this.#signal.removeEventListener('abort', this.#listener)
    } else {
      this.#signal.removeListener('abort', this.#listener)
    }

    this.#signal = null
    this.#listener = null
  }

  onResponseEnd (controller, trailers) {
    this.#removeSignal()
    return super.onResponseEnd(controller, trailers)
  }

  onResponseError (controller, err) {
    this.#removeSignal()
    return super.onResponseError(controller, err)
  }
}

module.exports = () => {
  return (dispatch) => {
    return function signalInterceptor (opts, handler) {
      const { signal } = opts

      if (!signal) {
        return dispatch(opts, handler)
      }

      return dispatch(opts, new SignalHandler({ signal }, { handler }))
    }
  }
}
