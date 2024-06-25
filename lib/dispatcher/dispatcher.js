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

const kOnDrain = Symbol('onDrain')
const kOnConnect = Symbol('onConnect')
const kOnDisconnect = Symbol('onDisconnect')
const kOnConnectionError = Symbol('onConnectionError')

class ComposedDispatcher extends Dispatcher {
  #dispatcher
  #dispatch

  constructor (dispatcher, dispatch) {
    super()

    this.#dispatcher = dispatcher
    this.#dispatch = dispatch

    this[kOnDrain] = (...args) => this.emit('drain', ...args)
    this[kOnConnect] = (...args) => this.emit('connect', ...args)
    this[kOnDisconnect] = (...args) => this.emit('disconnect', ...args)
    this[kOnConnectionError] = (...args) => this.emit('connectionError', ...args)

    this.#dispatcher
      .on('drain', this[kOnDrain])
      .on('connect', this[kOnConnect])
      .on('disconnect', this[kOnDisconnect])
      .on('connectionError', this[kOnConnectionError])
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
