'use strict'
/* global WeakRef, FinalizationRegistry */

const { InvalidArgumentError, InvalidReturnValueError } = require('./core/errors')
const Pool = require('./pool')

const kOpts = Symbol('opts')
const kCache = Symbol('cache')
const kCleanup = Symbol('cleanup')

class Agent {
  constructor (opts) {
    this[kOpts] = opts
    this[kCache] = new Map()
    this[kCleanup] = new FinalizationRegistry(key => {
      // get the WeakRef from the cache
      const ref = this[kCache].get(key)
      // if the WeakRef exists and the object has been reclaimed
      if (ref !== undefined && ref.deref() === undefined) {
        // remove the WeakRef from the cache
        this[kCache].delete(key)
      }
    })
  }

  get (origin) {
    if (typeof origin !== 'string' || origin === '') {
      throw new InvalidArgumentError('Origin must be a non-empty string.')
    }

    // check the cache for an existing WeakRef
    const ref = this[kCache].get(origin)

    // if one exists in the cache try to return the WeakRef
    if (ref !== undefined) {
      const cached = ref.deref()
      if (cached !== undefined) {
        return cached
      }
    }

    // otherwise, if it isn't in the cache or the reference has been cleaned up, create a new one!
    const value = new Pool(origin, this[kOpts])
    // add a WeakRef of the value to the cache
    this[kCache].set(origin, new WeakRef(value))
    // add the value to the finalization registry
    this[kCleanup].register(value, origin)

    return value
  }

  close () {
    const closePromises = []
    for (const ref in this[kCache].values()) {
      const pool = ref.deref()

      if (pool) {
        closePromises.push(pool.close())
      }
    }
    return Promise.all(closePromises)
  }

  destroy () {
    const destroyPromises = []
    for (const ref in this[kCache].values()) {
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

    const path = url.path || `${url.pathname || '/'}${url.search || ''}`

    const client = agent.get(url.origin)

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
