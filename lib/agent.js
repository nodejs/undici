'use strict'
const { InvalidArgumentError, InvalidReturnValueError } = require('./core/errors')
const Pool = require('./pool')
const Client = require('./core/client')
const util = require('./core/util')
const { kAgentOpts, kAgentCache } = require('./core/symbols')
const EventEmitter = require('events')

const kFactory = Symbol('factory')
const kOnConnect = Symbol('onConnect')
const kOnDisconnect = Symbol('onDisconnect')

class Agent extends EventEmitter {
  constructor (opts) {
    super()

    this[kAgentOpts] = opts
    this[kAgentCache] = new Map()

    const agent = this

    if (opts && opts.factory) {
      const factoryType = typeof opts.factory

      if (factoryType !== 'undefined' && factoryType !== 'function') {
        throw new InvalidArgumentError('factory must be a function.')
      }

      this[kFactory] = opts.factory
    } else {
      this[kFactory] = defaultFactory
    }

    this[kOnConnect] = function onConnect (client) {
      agent.emit('connect', client)
    }

    this[kOnDisconnect] = function onDestroy (client, err) {
      if (this.connected === 0 && this.size === 0) {
        this.off('disconnect', agent[kOnDisconnect])
        agent[kAgentCache].delete(this.origin)
      }

      agent.emit('disconnect', client, err)
    }
  }

  get (origin) {
    if (typeof origin !== 'string' || origin === '') {
      throw new InvalidArgumentError('Origin must be a non-empty string.')
    }

    const self = this
    let pool = self[kAgentCache].get(origin)

    if (!pool) {
      pool = this[kFactory](origin, self[kAgentOpts])
      pool.on('connect', this[kOnConnect]).on('disconnect', this[kOnDisconnect])

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

function defaultFactory (origin, opts) {
  return opts && opts.connections === 1 ? new Client(origin, opts) : new Pool(origin, opts)
}

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

    return client[requestType]({ ...opts, agent, requestType, method, path }, ...additionalArgs)
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
