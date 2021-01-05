'use strict'
/* global WeakRef, FinalizationRegistry */

const { InvalidArgumentError } = require('./core/errors')
const { Pool } = require('../')

function weakCache (fn) {
  const cache = new Map()
  const cleanup = new FinalizationRegistry(key => {
    // get the WeakRef from the cache
    const ref = cache.get(key)
    // if the WeakRef exists and the object has been reclaimed
    if (ref !== undefined && ref.deref() === undefined) {
      // remove the WeakRef from the cache
      cache.delete(key)
    }
  })
  return key => {
    // check the cache for an existing WeakRef
    const ref = cache.get(key)

    // if one exists in the cache try to return the WeakRef
    if (ref !== undefined) {
      const cached = ref.deref()
      if (cached !== undefined) {
        return cached
      }
    }

    // otherwise, if it isn't in the cache or the reference has been cleaned up, create a new one!
    const value = fn(key)
    // add a WeakRef of the value to the cache
    cache.set(key, new WeakRef(value))
    // add the value to the finalization registry
    cleanup.register(value, key)
    return value
  }
}

const kAgentFactory = Symbol('agent factory')

class Agent {
  constructor (opts) {
    this[kAgentFactory] = weakCache(origin => new Pool(origin, opts))
  }

  get (origin) {
    if (typeof origin !== 'string' || origin === '') {
      throw TypeError('Origin must be a non-empty string.')
    }

    return this[kAgentFactory](origin)
  }
}

let globalAgent = new Agent()

function setGlobalAgent (agent) {
  if (agent instanceof Agent) {
    globalAgent = agent
  } else {
    throw InvalidArgumentError('Argument agent must be instance of Agent')
  }
}

/**
 *
 * @param {string | import('url').URL} url
 * @param {*} opts
 */
function request (url, opts = {}) {
  // if url is a string transform into URL inst. otherwise use as is
  url = typeof url === 'string' ? new URL(url) : url

  if (typeof url.origin !== 'string' || url.origin === '') {
    throw InvalidArgumentError('Argument url.origin must be a non-empty string')
  }

  const agent = (opts.agent === undefined || opts.agent === null) ? globalAgent : opts.agent

  const client = agent.get(url.origin)

  if (client && typeof client.request !== 'function') {
    throw TypeError('Pool returned from Agent does not implement method `.request`')
  }

  return client.request({
    ...opts,
    method: opts.method || 'GET',
    path: url.path || `${url.pathname || ''}${url.search || ''}`
  })
}

module.exports = {
  request,
  setGlobalAgent,
  Agent
}
