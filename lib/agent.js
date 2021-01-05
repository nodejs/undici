'use strict'
/* global WeakRef, FinalizationRegistry */

const { InvalidArgumentError, InvalidReturnValueError, NotSupportedError } = require('./core/errors')
const { Pool } = require('../')
const { weakCache, nodeMajorVersionIsGreaterThanOrEqualTo } = require('./core/util')

const kAgentFactory = Symbol('agent factory')

class Agent {
  constructor (opts) {
    if (!nodeMajorVersionIsGreaterThanOrEqualTo(14)) {
      throw NotSupportedError('Node.js version must be 14 or above')
    }
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
  if (!nodeMajorVersionIsGreaterThanOrEqualTo(14)) {
    throw NotSupportedError('Node.js version must be 14 or above')
  }

  if (typeof agent.get === 'function') {
    globalAgent = agent
  } else {
    throw InvalidArgumentError('Argument agent must implement Agent')
  }
}

function getClientFromAgent (agent, url) {
  if (!nodeMajorVersionIsGreaterThanOrEqualTo(14)) {
    throw NotSupportedError('Node.js version must be 14 or above')
  }

  // if url is a string transform into URL inst. otherwise use as is
  url = typeof url === 'string' ? new URL(url) : url
  // ensure it atleast has a non-empty string origin
  if (typeof url.origin !== 'string' || url.origin === '') {
    throw InvalidArgumentError('Argument url.origin must be a non-empty string')
  }

  const client = agent.get(url.origin)

  if (client && typeof client.request !== 'function') {
    throw InvalidReturnValueError('Client returned from Agent.get() does not implement method `.request()`')
  }

  return client
}

/**
 *
 * @param {string | import('url').URL} url
 * @param {*} opts
 */
function request (url, { agent = globalAgent, ...opts } = {}) {
  const client = getClientFromAgent(agent, url)

  return client.request({
    ...opts,
    method: opts.method || 'GET',
    path: url.path || `${url.pathname || ''}${url.search || ''}`
  })
}

function stream (url, { agent = globalAgent, ...opts } = {}, factory) {
  const client = getClientFromAgent(agent, url)

  return client.stream({
    ...opts,
    method: opts.method || 'GET',
    path: url.path || `${url.pathname || ''}${url.search || ''}`
  }, factory)
}

function pipeline (url, { agent = globalAgent, ...opts } = {}, handler) {
  const client = getClientFromAgent(agent, url)

  return client.pipeline({
    ...opts,
    method: opts.method || 'GET',
    path: url.path || `${url.pathname || ''}${url.search || ''}`
  }, handler)
}

module.exports = {
  request,
  stream,
  pipeline,
  setGlobalAgent,
  Agent
}
