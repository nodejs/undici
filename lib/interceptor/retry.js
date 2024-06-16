'use strict'

const RetryHandler = require('../handler/retry-handler')
const createResponseErrorInterceptor = require('./response-error')

module.exports = globalOpts => {
  return dispatch => {
    const responseErrorInterceptor = createResponseErrorInterceptor(dispatch)

    return function retryInterceptor (opts, handler) {
      const wrappedHandler = {
        onConnect: handler.onConnect ? handler.onConnect.bind(handler) : undefined,
        onHeaders: handler.onHeaders.bind(handler),
        onData: handler.onData.bind(handler),
        onComplete: handler.onComplete.bind(handler),
        onError: handler.onError.bind(handler)
      }

      const finalHandler = new RetryHandler(
        { ...opts, retryOptions: { ...globalOpts, ...opts.retryOptions } },
        { handler: wrappedHandler, dispatch }
      )

      return responseErrorInterceptor(opts, finalHandler)
    }
  }
}
