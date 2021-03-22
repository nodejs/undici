'use strict'

const Client = require('./lib/core/client')
const errors = require('./lib/core/errors')
const Pool = require('./lib/client-pool')
const { Agent, getGlobalAgent, setGlobalAgent } = require('./lib/agent')
const { RedirectAgent } = require('./lib/agent-redirect')
const util = require('./lib/core/util')
const { InvalidArgumentError } = require('./lib/core/errors')
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
module.exports.RedirectAgent = RedirectAgent
module.exports.setGlobalAgent = setGlobalAgent
module.exports.getGlobalAgent = getGlobalAgent

function dispatchFromAgent (fn) {
  return (url, { agent = getGlobalAgent(), method = 'GET', ...opts } = {}, ...additionalArgs) => {
    if (opts.path != null) {
      throw new InvalidArgumentError('unsupported opts.path')
    }

    const { origin, pathname, search } = util.parseURL(url)
    const path = search ? `${pathname || '/'}${search || ''}` : pathname

    return fn.call(agent, { ...opts, origin, method, path }, ...additionalArgs)
  }
}

module.exports.request = dispatchFromAgent(api.request)
module.exports.stream = dispatchFromAgent(api.stream)
module.exports.pipeline = dispatchFromAgent(api.pipeline)
module.exports.connect = dispatchFromAgent(api.connect)
module.exports.upgrade = dispatchFromAgent(api.upgrade)
