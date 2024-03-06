'use strict'
const RetryHandler = require('../handler/retry-handler')

module.exports = globalOpts => {
  return dispatch => {
    return function retryInterceptor (opts, handler) {
      opts.retryOptions = { ...globalOpts, ...opts.retryOptions }

      return dispatch(
        opts,
        new RetryHandler(opts, {
          handler,
          dispatch
        })
      )
    }
  }
}
