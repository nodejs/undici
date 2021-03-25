'use strict'

const Client = require('./lib/client')
const Dispatcher = require('./lib/dispatcher')
const errors = require('./lib/core/errors')
const Pool = require('./lib/pool')
const Agent = require('./lib/agent')
const util = require('./lib/core/util')
const { InvalidArgumentError } = require('./lib/core/errors')
const api = require('./lib/api')

Object.assign(Dispatcher.prototype, api)

module.exports.Dispatcher = Dispatcher
module.exports.Client = Client
module.exports.Pool = Pool
module.exports.Agent = Agent

module.exports.errors = errors

let globalDispatcher = new Agent()

function setGlobalDispatcher (agent) {
  if (!agent || typeof agent.dispatch !== 'function') {
    throw new InvalidArgumentError('Argument agent must implement Agent')
  }
  globalDispatcher = agent
}

function getGlobalDispatcher () {
  return globalDispatcher
}

function makeDispatcher (fn) {
  return (url, { agent, dispatcher = getGlobalDispatcher(), method = 'GET', ...opts } = {}, ...additionalArgs) => {
    if (opts.path != null) {
      throw new InvalidArgumentError('unsupported opts.path')
    }

    if (agent) {
      throw new InvalidArgumentError('unsupported opts.agent. Did you mean opts.client?')
    }

    const { origin, pathname, search } = util.parseURL(url)
    const path = search ? `${pathname}${search}` : pathname

    return fn.call(dispatcher, { ...opts, origin, method, path }, ...additionalArgs)
  }
}

module.exports.setGlobalDispatcher = setGlobalDispatcher
module.exports.getGlobalDispatcher = getGlobalDispatcher

module.exports.request = makeDispatcher(api.request)
module.exports.stream = makeDispatcher(api.stream)
module.exports.pipeline = makeDispatcher(api.pipeline)
module.exports.connect = makeDispatcher(api.connect)
module.exports.upgrade = makeDispatcher(api.upgrade)
