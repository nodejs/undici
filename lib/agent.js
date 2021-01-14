'use strict'

const { InvalidArgumentError, InvalidReturnValueError } = require('./core/errors')
const Pool = require('./pool')
const { weakCache } = require('./core/util')

const kAgentFactory = Symbol('agent factory')

class Agent {
  constructor (opts) {
    this[kAgentFactory] = weakCache(origin => new Pool(origin, opts))
    this.origins = []
  }

  get (origin) {
    if (typeof origin !== 'string' || origin === '') {
      throw new InvalidArgumentError('Origin must be a non-empty string.')
    }

    if (this.origins.indexOf(origin) === -1) {
      this.origins.push(origin)
    }

    return this[kAgentFactory](origin)
  }

 close () {
    const closePromises = []
    for (const origin in origins) {
      const client = this[kAgentFactory](origin)
      closePromises.push(client.close.bind(client)())
    }
    return Promise.all(closePromises)
  }

  async destroy () {
    const destroyPromises = []
    for (const origin in origins) {
      const client = this[kAgentFactory](origin)
      destroyPromises.push(client.destroy.bind(client)())
    }
    return Promise.all(destroyPromises)
  }
}

let globalAgent = null
try {
  globalAgent = new Agent({ connections: null })
} catch (err) {
  // Silently fail to set globalAgent due to unsupported environment.
}

function setGlobalAgent (agent) {
  if (!agent || typeof agent.get !== 'function') {
    throw new InvalidArgumentError('Argument agent must implement Agent')
  }
  globalAgent = agent
}

function dispatchFromAgent (requestType) {
  return (url, { agent = globalAgent, method = 'GET', ...opts } = {}, ...additionalArgs) => {
    if (url === undefined || url === null) {
      throw new InvalidArgumentError('Argument url must be defined')
    }

    if (!agent || typeof agent.get !== 'function') {
      throw new InvalidArgumentError('Argument agent must implement Agent')
    }

    if (opts.path != null) {
      throw new InvalidArgumentError('unsupported opts.path')
    }

    // if url is a string transform into URL inst. otherwise use as is
    url = typeof url === 'string' ? new URL(url) : url
    // ensure it atleast has a non-empty string origin
    if (!url || typeof url.origin !== 'string' || url.origin === '') {
      throw new InvalidArgumentError('Argument url.origin must be a non-empty string')
    }

    const client = agent.get(url.origin)

    if (client && typeof client[requestType] !== 'function') {
      throw new InvalidReturnValueError(`Client returned from Agent.get() does not implement method ${requestType}`)
    }

    const path = url.path || `${url.pathname || '/'}${url.search || ''}`

    return client[requestType]({ ...opts, method, path }, ...additionalArgs)
  }
}

module.exports = {
  request: dispatchFromAgent('request'),
  stream: dispatchFromAgent('stream'),
  pipeline: dispatchFromAgent('pipeline'),
  connect: dispatchFromAgent('connect'),
  upgrade: dispatchFromAgent('upgrade'),
  setGlobalAgent,
  Agent
}
