'use strict'

const { InvalidArgumentError, InvalidReturnValueError, NotSupportedError } = require('./core/errors')
const Pool = require('./pool')
const { getPath, weakCache, checkForWeakRefAndFinalizationRegistrySupport } = require('./core/util')

const kAgentFactory = Symbol('agent factory')

class Agent {
  constructor (opts) {
    /* istanbul ignore next */
    checkForWeakRefAndFinalizationRegistrySupport()

    this[kAgentFactory] = weakCache(origin => new Pool(origin, opts))
  }

  get (origin) {
    if (typeof origin !== 'string' || origin === '') {
      throw new InvalidArgumentError('Origin must be a non-empty string.')
    }

    return this[kAgentFactory](origin)
  }
}

let globalAgent
try {
  globalAgent = new Agent()
} catch (err) {
  if (err instanceof NotSupportedError) {
    // silently fail to set globalAgent due to unsupported environment
    globalAgent = null
  }
}

function setGlobalAgent (agent) {
  /* istanbul ignore next */
  checkForWeakRefAndFinalizationRegistrySupport()

  if (typeof agent.get === 'function') {
    globalAgent = agent
  } else {
    throw new InvalidArgumentError('Argument agent must implement Agent')
  }
}

function dispatchFromAgent (requestType) {
  return (url, { agent = globalAgent, method = 'GET', ...opts } = {}, ...additionalArgs) => {
    /* istanbul ignore next */
    checkForWeakRefAndFinalizationRegistrySupport()

    if (url === undefined || url === null) {
      throw new InvalidArgumentError('Argument url must be defined')
    }

    // if url is a string transform into URL inst. otherwise use as is
    url = typeof url === 'string' ? new URL(url) : url
    // ensure it atleast has a non-empty string origin
    if (typeof url.origin !== 'string' || url.origin === '') {
      throw new InvalidArgumentError('Argument url.origin must be a non-empty string')
    }

    const client = agent.get(url.origin)

    if (client && typeof client[requestType] !== 'function') {
      throw new InvalidReturnValueError(`Client returned from Agent.get() does not implement method ${requestType}`)
    }

    return client[requestType]({ ...opts, method, path: getPath(url) }, ...additionalArgs)
  }
}

module.exports = {
  request: dispatchFromAgent('request'),
  stream: dispatchFromAgent('stream'),
  pipeline: dispatchFromAgent('pipeline'),
  setGlobalAgent,
  Agent
}
