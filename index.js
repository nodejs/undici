'use strict'

const Client = require('./lib/core/client')
const errors = require('./lib/core/errors')
const Pool = require('./lib/client-pool')
const { Agent, getGlobalAgent, setGlobalAgent } = require('./lib/agent')
const util = require('./lib/core/util')
const { InvalidArgumentError, InvalidReturnValueError } = require('./lib/core/errors')
const api = require('./lib/api')

Object.assign(Client.prototype, api)
Object.assign(Pool.prototype, api)

function undici (url, opts) {
  return new Pool(url, opts)
}

module.exports = undici

module.exports.Pool = Pool
module.exports.Client = Client
module.exports.errors = errors

module.exports.Agent = Agent
module.exports.setGlobalAgent = setGlobalAgent
module.exports.getGlobalAgent = getGlobalAgent

function dispatchFromAgent (requestType) {
  return (url, { agent = getGlobalAgent(), method = 'GET', ...opts } = {}, ...additionalArgs) => {
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

module.exports.request = dispatchFromAgent('request')
module.exports.stream = dispatchFromAgent('stream')
module.exports.pipeline = dispatchFromAgent('pipeline')
module.exports.connect = dispatchFromAgent('connect')
module.exports.upgrade = dispatchFromAgent('upgrade')
