'use strict'

const { InvalidArgumentError } = require('../core/errors')
const ProxyAgent = require('../dispatcher/proxy-agent')
const DispatcherBase = require('../dispatcher/dispatcher-base')

class ProxyInterceptor extends DispatcherBase {
  constructor (dispatcher, opts) {
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

module.exports = opts => {
  if (typeof opts === 'string') {
    opts = { uri: opts }
  }

  if (!opts || (!opts.uri && !(opts instanceof URL))) {
    throw new InvalidArgumentError('Proxy opts.uri or instance of URL is mandatory')
  }

  if (opts.auth && opts.token) {
    throw new InvalidArgumentError(
      'opts.auth cannot be used in combination with opts.token'
    )
  }

  return dispatcher => new ProxyInterceptor(dispatcher, opts)
}
