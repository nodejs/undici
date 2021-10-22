'use strict'

const { kClients, kProxy } = require('./core/symbols')
const Agent = require('./agent')
const Dispatcher = require('./dispatcher')
const { InvalidArgumentError } = require('./core/errors')

const kAgent = Symbol('proxy agent')

class ProxyAgent extends Dispatcher {
  constructor (opts) {
    super(opts)
    this[kProxy] = buildProxyOptions(opts)

    const agent = new Agent(opts)
    this[kAgent] = agent

    this[kClients] = agent[kClients]
  }

  dispatch (opts, handler) {
    return this[kAgent].dispatch(
      {
        ...opts,
        origin: this[kProxy].uri,
        path: opts.origin + opts.path,
        headers: { host: opts.origin, ...opts.headers }
      },
      handler
    )
  }

  async close () {
    await this[kAgent].close()
    this[kClients].clear()
  }
}

function buildProxyOptions(opts) {
  if (typeof opts === 'string') {
    opts = { uri: opts }
  }

  if (!opts || !opts.uri) {
    throw new InvalidArgumentError('Proxy opts.uri is mandatory')
  }

  return {
    uri: opts.uri,
    protocol: opts.protocol || 'https'
  }
}

module.exports = ProxyAgent
