'use strict'
/* global WeakRef, FinalizationRegistry */

const { InvalidArgumentError, InvalidReturnValueError } = require('./core/errors')
const Pool = require('./pool')
const util = require('./core/util')
const { kAgentOpts, kAgentCache, kAgentCleanup } = require('./core/symbols')

class Agent {
  constructor (opts) {
    this[kAgentOpts] = opts
    this[kAgentCache] = new Map()
    this[kAgentCleanup] = new FinalizationRegistry(key => {
      // get the WeakRef from the cache
      const ref = this[kAgentCache].get(key)
      // if the WeakRef exists and the object has been reclaimed
      if (ref !== undefined && ref.deref() === undefined) {
        // remove the WeakRef from the cache
        this[kAgentCache].delete(key)
      }
    })
  }

  get (origin) {
    if (typeof origin !== 'string' || origin === '') {
      throw new InvalidArgumentError('Origin must be a non-empty string.')
    }

    // check the cache for an existing WeakRef
    const ref = this[kAgentCache].get(origin)

    // if one exists in the cache try to return the WeakRef
    if (ref !== undefined) {
      const cached = ref.deref()
      if (cached !== undefined) {
        return cached
      }
    }

    // otherwise, if it isn't in the cache or the reference has been cleaned up, create a new one!
    const value = new Pool(origin, this[kAgentOpts])
    // add a WeakRef of the value to the cache
    this[kAgentCache].set(origin, new WeakRef(value))
    // add the value to the finalization registry
    this[kAgentCleanup].register(value, origin)

    return value
  }

  close () {
    const closePromises = []
    for (const ref of this[kAgentCache].values()) {
      const pool = ref.deref()

      if (pool) {
        closePromises.push(pool.close())
      }
    }
    return Promise.all(closePromises)
  }

  destroy () {
    const destroyPromises = []
    for (const ref of this[kAgentCache].values()) {
      const pool = ref.deref()

      if (pool) {
        destroyPromises.push(pool.destroy())
      }
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
