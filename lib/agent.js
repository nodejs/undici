'use strict'
const { InvalidArgumentError, InvalidReturnValueError } = require('./core/errors')
const Pool = require('./pool')
const util = require('./core/util')
const { kAgentOpts, kAgentCache } = require('./core/symbols')

class Agent {
  constructor (opts) {
    this[kAgentOpts] = opts
    this[kAgentCache] = new Map()
  }

  get (origin) {
    if (typeof origin !== 'string' || origin === '') {
      throw new InvalidArgumentError('Origin must be a non-empty string.')
    }

    const self = this
    let pool = self[kAgentCache].get(origin)

    function onDisconnect () {
      if (this.connected === 0 && this.size === 0) {
        this.off('disconnect', onDisconnect)
        self[kAgentCache].delete(origin)
      }
    }

    if (!pool) {
      pool = new Pool(origin, self[kAgentOpts])
      pool.on('disconnect', onDisconnect)
      self[kAgentCache].set(origin, pool)
    }

    return pool
  }

  close () {
    const closePromises = []
    for (const pool of this[kAgentCache].values()) {
      closePromises.push(pool.close())
    }
    return Promise.all(closePromises)
  }

  destroy () {
    const destroyPromises = []
    for (const pool of this[kAgentCache].values()) {
      destroyPromises.push(pool.destroy())
    }
    return Promise.all(destroyPromises)
  }
}

let globalAgent = new Agent({ connections: null })

function setGlobalAgent (agent) {
  if (!agent || typeof agent.get !== 'function') {
    throw new InvalidArgumentError('Argument agent must implement Agent')
  }
  globalAgent = agent
}

function dispatchFromAgent (requestType) {
  return (url, { agent = globalAgent, method = 'GET', ...opts } = {}, ...additionalArgs) => {
    if (opts.path != null) {
      throw new InvalidArgumentError('unsupported opts.path')
    }

    const { origin, pathname, search } = util.parseURL(url)

    const path = `${pathname || '/'}${search || ''}`

    const client = agent.get(origin)

    if (client && typeof client[requestType] !== 'function') {
      throw new InvalidReturnValueError(`Client returned from Agent.get() does not implement method ${requestType}`)
    }

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
