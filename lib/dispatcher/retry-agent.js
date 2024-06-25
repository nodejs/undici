'use strict'

const Dispatcher = require('./dispatcher')
const RetryHandler = require('../handler/retry-handler')

class RetryAgent extends Dispatcher {
  #agent
  #options

  constructor (agent, options = {}) {
    super(options)
    this.#agent = agent
    this.#options = options
  }

  dispatch (opts, handler, onDrain) {
    const retry = new RetryHandler({
      ...opts,
      retryOptions: this.#options
    }, {
      dispatch: this.#agent.dispatch.bind(this.#agent),
      handler
    })
    return this.#agent.dispatch(opts, retry, onDrain)
  }

  close () {
    return this.#agent.close()
  }

  destroy () {
    return this.#agent.destroy()
  }
}

module.exports = RetryAgent
