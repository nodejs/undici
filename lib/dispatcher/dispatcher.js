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

      if (dispatch == null || typeof dispatch !== 'function' || dispatch.length !== 2) {
        throw new TypeError('invalid interceptor')
      }
    }

    return new ComposedDispatcher(this, dispatch)
  }
}

const registry = new FinalizationRegistry(({ dispatcher, handlers }) => {
  for (const [event, listener] of handlers) {
    dispatcher.off(event, listener)
  }
})

class ComposedDispatcher extends Dispatcher {
  #dispatcher
  #dispatch

  constructor (dispatcher, dispatch) {
    super()

    this.#dispatcher = dispatcher
    this.#dispatch = dispatch

    const weakThis = new WeakRef(this)
    const handlers = []

    for (const event of ['drain', 'connect', 'disconnect', 'connectionError']) {
      const listener = function (...args) {
        weakThis.deref()?.emit(event, ...args)
      }
      handlers.push([event, listener])
      dispatcher.on(event, listener)
    }

    registry.register(this, { dispatcher, handlers })
  }

  dispatch (...args) {
    return this.#dispatch(...args)
  }

  close (...args) {
    return this.#dispatcher.close(...args)
  }

  destroy (...args) {
    return this.#dispatcher.destroy(...args)
  }
}

module.exports = Dispatcher
