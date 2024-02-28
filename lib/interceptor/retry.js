'use strict'

const Dispatcher = require('../dispatcher/dispatcher-base')
const RetryHandler = require('../handler/RetryHandler')

class RetryDispatcher extends Dispatcher {
  #dispatcher
  #opts

  constructor (dispatcher, opts) {
    super()

    this.#dispatcher = dispatcher
    this.#opts = opts
  }

  dispatch (opts, handler) {
    return this.#dispatcher.dispatch(
      opts,
      new RetryHandler(this.#dispatcher, opts, this.#opts, handler)
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
