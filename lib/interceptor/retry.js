'use strict'
const RetryHandler = require('../handler/retry-handler')

module.exports = globalOpts => {
  return dispatcher => {
    const bindedDispatch = dispatcher.dispatch.bind(dispatcher)

    return function retryInterceptor (opts, handler) {
      opts.retryOptions = { ...globalOpts, ...opts.retryOptions }

      return bindedDispatch(
        opts,
        new RetryHandler(opts, {
          handler,
          dispatch: bindedDispatch
        })
      )
    }
  }
}
