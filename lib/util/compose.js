'use strict'

module.exports = function compose (...args) {
  // So we handle [interceptor1, interceptor2] or interceptor1, interceptor2, ...
  const interceptors = Array.isArray(args[0]) ? args[0] : args

  let dispatch

  for (let interceptor of interceptors) {
    if (interceptor == null) {
      continue
    }

    if (typeof interceptor !== 'function') {
      if (interceptor?.dispatch === 'function') {
        interceptor = interceptor.dispatch.bind(interceptor)
      } else {
        throw new TypeError(`invalid interceptor, expected function received ${typeof interceptor}`)
      }
    }

    dispatch = interceptor(dispatch)

    if (dispatch == null || typeof dispatch !== 'function' || dispatch.length !== 2) {
      throw new TypeError('invalid interceptor')
    }
  }

  return dispatch
}
