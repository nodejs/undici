'use strict'
const EventEmitter = require('node:events')

const kDispatcherVersion = Symbol.for('undici.dispatcher.version')

class Dispatcher extends EventEmitter {
  [kDispatcherVersion] = 1

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
    let dispatcher = this
    for (const interceptor of interceptors) {
      if (interceptor == null) {
        continue
      }

      if (typeof interceptor !== 'function') {
        throw new Error('invalid interceptor')
      }

      dispatcher = interceptor(dispatcher) ?? dispatcher

      if (dispatcher[kDispatcherVersion] !== 1) {
        throw new Error('invalid dispatcher')
      }
    }
    return dispatcher
  }
}

module.exports = Dispatcher
