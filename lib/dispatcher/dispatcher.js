'use strict'
const EventEmitter = require('node:events')

class Dispatcher extends EventEmitter {
  dispatch () {
    throw new Error('not implemented')
  }

  close () {
    throw new Error('not implemented')
  }

  destroy () {
    throw new Error('not implemented')
  }

  compose (...args) {
    // So we handle [interceptor1, interceptor2] or interceptor1, interceptor2, ...
    const interceptors = Array.isArray(args[0]) ? args[0] : args
    let dispatch = this.dispatch.bind(this)

    for (const interceptor of interceptors) {
      if (interceptor == null) {
        continue
      }

      if (typeof interceptor !== 'function') {
        throw new TypeError(`invalid interceptor, expected function received ${typeof interceptor}`)
      }

      dispatch = interceptor(dispatch)

      if (dispatch == null || typeof dispatch !== 'function') {
        throw new TypeError('invalid interceptor')
      }
    }

    return new ComposedDispatcher(this, dispatch)
  }
}

class ComposedDispatcher extends Dispatcher {
  #dispatcher = null
  #dispatch = null

  constructor (dispatcher, dispatch) {
    super()
    this.#dispatcher = dispatcher
    this.#dispatch = dispatch
  }

  dispatch (opts, handler, onDrain) {
    // Allocating a closure here every time is not great...
    return this.#dispatch(opts, handler, onDrain ?? (() => {
      // XXX: Stop if error?
      this.#dispatch(opts, handler, onDrain)
    }))
  }

  close (...args) {
    return this.#dispatcher.close(...args)
  }

  destroy (...args) {
    return this.#dispatcher.destroy(...args)
  }
}

module.exports = Dispatcher
