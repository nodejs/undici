'use strict'

const { InvalidArgumentError } = require('../core/errors')
const ProxyAgent = require('../dispatcher/proxy-agent')
const Dispatcher = require('../dispatcher/dispatcher')

class ProxyInterceptor extends Dispatcher {
  constructor (dispatcher, opts) {
    if (dispatcher == null) {
      throw new InvalidArgumentError(
        'Dispatcher instance is mandatory for ProxyInterceptor'
      )
    }

    if (typeof opts === 'string') {
      opts = { uri: opts }
    }

    if (!opts || (!opts.uri && !(opts instanceof URL))) {
      throw new InvalidArgumentError(
        'Proxy opts.uri or instance of URL is mandatory'
      )
    }

    if (opts.auth && opts.token) {
      throw new InvalidArgumentError(
        'opts.auth cannot be used in combination with opts.token'
      )
    }

    super()
    this.dispatcher = dispatcher
    this.agent = new ProxyAgent(opts)
  }

  dispatch (opts, handler) {
    return this.agent.dispatch(opts, handler)
  }

  close () {
    return this.dispatcher.close().then(() => this.agent.close())
  }
}

module.exports = ProxyInterceptor
