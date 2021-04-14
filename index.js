'use strict'

const Client = require('./lib/client')
const Dispatcher = require('./lib/dispatcher')
const errors = require('./lib/core/errors')
const Pool = require('./lib/pool')
const Agent = require('./lib/agent')
const util = require('./lib/core/util')
const { InvalidArgumentError } = require('./lib/core/errors')
const api = require('./lib/api')
const MockClient = require('./lib/mock/mock-client')
const MockAgent = require('./lib/mock/mock-agent')
const MockPool = require('./lib/mock/mock-pool')

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
  return (url, opts = {}, ...additionalArgs) => {
    if (url && typeof url === 'object' && !(url instanceof URL)) {
      additionalArgs = [opts, ...additionalArgs]
      opts = url
    } else if (opts && opts.path != null && url.pathname !== '/') {
      throw new InvalidArgumentError('cannot combine url.pathname and opts.path')
    }

    const { agent, dispatcher = getGlobalDispatcher() } = opts

    if (agent) {
      throw new InvalidArgumentError('unsupported opts.agent. Did you mean opts.client?')
    }

    url = util.parseURL(url)

    const path = url.search ? `${url.pathname}${url.search}` : url.pathname
    const origin = url.origin
    const method = opts.method ? opts.method : opts.body ? 'PUT' : 'GET'

    return fn.call(dispatcher, { ...opts, origin, path, method }, ...additionalArgs)
  }
}

module.exports.setGlobalDispatcher = setGlobalDispatcher
module.exports.getGlobalDispatcher = getGlobalDispatcher

module.exports.request = makeDispatcher(api.request)
module.exports.stream = makeDispatcher(api.stream)
module.exports.pipeline = makeDispatcher(api.pipeline)
module.exports.connect = makeDispatcher(api.connect)
module.exports.upgrade = makeDispatcher(api.upgrade)

module.exports.MockClient = MockClient
module.exports.MockPool = MockPool
module.exports.MockAgent = MockAgent
