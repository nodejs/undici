'use strict'
const EventEmitter = require('node:events')
const { kUrl } = require('../core/symbols')

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

    return new Proxy(this, {
      get: (target, key) => {
        if (key !== 'dispatch') {
          return target[key]
        }

        return function composedDispatch (opts, handler) {
          const origin = target[kUrl]?.origin
          if (origin != null && opts?.origin == null) {
            opts = { ...opts, origin }
          }
          return dispatch(opts, handler)
        }
      }
    })
  }
}

module.exports = Dispatcher
