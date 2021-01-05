'use strict'
/* global WeakRef, FinalizationRegistry */

const { Pool } = require('../')

const kAgentPoolOpts = Symbol('agent pool opts')
const kAgentCache = Symbol('agent cache')
const kAgentRegistry = Symbol('agent registry')
class Agent {
  constructor (opts) {
    this[kAgentPoolOpts] = opts
    this[kAgentCache] = new Map()
    this[kAgentRegistry] = new FinalizationRegistry(key => {
      // get the Pool WeakRef from the cache
      const ref = this[kAgentCache].get(key)
      // if the WeakRef exists and the object has been reclaimed
      // according to mdn the second logic operation here is superfluous as a deref call in a FR will always return undefined
      if (ref !== undefined && ref.deref() === undefined) {
        // remove the WeakRef from the cache
        this[kAgentCache].delete(key)
      }
    })
  }

  get (origin) {
    if (typeof origin !== 'string' || origin === '') {
      throw TypeError('Origin must be a non-empty string.')
    }

    // check the cache for an existing Pool
    const ref = this[kAgentCache].get(origin)

    // if one exists in the cache try to return the WeakRef
    if (ref !== undefined) {
      const deref = ref.deref()
      if (deref !== undefined) {
        return deref
      }
    }

    // otherwise, if it isn't in the cache or the reference has been cleaned up, create a new one!
    const pool = new Pool(origin, this[kAgentPoolOpts])
    // add a WeakRef of the Pool to the cache
    this[kAgentCache].set(origin, new WeakRef(pool))
    // add the Pool to the finalization registry
    this[kAgentRegistry].register(pool, origin)

    return pool
  }
}

const globalAgent = new Agent()

/**
 *
 * @param {string | import('url').URL} url
 * @param {*} opts
 */
function request (url, opts = {}) {
  // if url is a string transform into URL inst. otherwise use as is
  url = typeof url === 'string' ? new URL(url) : url

  const agent = (opts.agent === undefined || opts.agent === null) ? globalAgent : opts.agent

  const pool = agent.get(url.origin)

  if (pool && typeof pool.request !== 'function') {
    throw TypeError('Pool returned from Agent does not implement method `.request`')
  }

  return pool.request({
    ...opts,
    method: opts.method || 'GET',
    path: url.path || `${url.pathname || ''}${url.search || ''}`
  })
}

module.exports = {
  request,
  Agent
}
