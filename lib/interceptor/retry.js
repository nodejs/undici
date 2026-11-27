'use strict'
const RetryHandler = require('../handler/retry-handler')

module.exports = globalOpts => {
  return dispatch => {
    return function retryInterceptor (opts, handler) {
      const retryHandler = new RetryHandler(
        { ...opts, retryOptions: { ...globalOpts, ...opts.retryOptions } },
        {
          handler,
          dispatch
        }
      )
      // Send the body the handler tracks, so it can tell when a body that
      // cannot be replayed was consumed by this first attempt.
      const { body } = retryHandler.opts
      return dispatch(body === opts.body ? opts : { ...opts, body }, retryHandler)
    }
  }
}
