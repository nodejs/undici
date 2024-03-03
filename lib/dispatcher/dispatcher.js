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
    for (const interceptor of interceptors) {
      if (interceptor == null) {
        continue
      }

      if (typeof interceptor !== 'function') {
        throw new Error('invalid interceptor')
      }

      const newDispatch = interceptor(this)

      if (newDispatch == null || typeof newDispatch !== 'function' || newDispatch.length !== 2) {
        throw new Error('invalid interceptor')
      }

      this.dispatch = newDispatch
    }

    return this
  }
}

module.exports = Dispatcher
