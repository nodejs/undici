'use strict'

const { InvalidArgumentError } = require('../core/errors')
const Dispatcher = require('../dispatcher/dispatcher-base')
const RedirectHandler = require('../handler/RedirectHandler')

class RedirectDispatcher extends Dispatcher {
  #opts
  #dispatcher

  constructor (dispatcher, opts) {
    super()

    this.#dispatcher = dispatcher
    this.#opts = opts
  }

  dispatch (opts, handler) {
    return this.#dispatcher.dispatch(
      opts,
      new RedirectHandler(this.#dispatcher, opts, this.#opts, handler)
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
  if (opts?.maxRedirections == null || opts?.maxRedirections === 0) {
    return null
  }

  if (!Number.isInteger(opts.maxRedirections) || opts.maxRedirections < 0) {
    throw new InvalidArgumentError('maxRedirections must be a positive number')
  }

  return dispatcher => new RedirectDispatcher(dispatcher, opts)
}
