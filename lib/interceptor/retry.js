'use strict'

const Dispatcher = require('../dispatcher/dispatcher')
const RetryHandler = require('../handler/retry-handler')

class RetryDispatcher extends Dispatcher {
  #dispatcher
  #opts

  constructor (dispatcher, opts) {
    super()

    this.#dispatcher = dispatcher
    this.#opts = opts
  }

  dispatch (opts, handler) {
    opts.retryOptions = { ...this.#opts, ...opts.retryOptions }

    return this.#dispatcher.dispatch(
      opts,
      new RetryHandler(opts, {
        handler,
        dispatch: this.#dispatcher.dispatch.bind(this.#dispatcher)
      })
    )
  }

  close (...args) {
    return this.#dispatcher.close(...args)
  }

  destroy (...args) {
    return this.#dispatcher.destroy(...args)
  }
}

module.exports = opts => {
  return dispatcher => new RetryDispatcher(dispatcher, opts)
}
