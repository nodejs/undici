'use strict'

const Client = require('./lib/client')
const Dispatcher = require('./lib/dispatcher')
const errors = require('./lib/core/errors')
const Pool = require('./lib/pool')
const Agent = require('./lib/agent')
const util = require('./lib/core/util')
const { InvalidArgumentError } = errors
const api = require('./lib/api')
const buildConnector = require('./lib/core/connect')
const MockClient = require('./lib/mock/mock-client')
const MockAgent = require('./lib/mock/mock-agent')
const MockPool = require('./lib/mock/mock-pool')
const mockErrors = require('./lib/mock/mock-errors')

const nodeVersion = process.versions.node.split('.')
const nodeMajor = Number(nodeVersion[0])
const nodeMinor = Number(nodeVersion[1])

Object.assign(Dispatcher.prototype, api)

module.exports.Dispatcher = Dispatcher
module.exports.Client = Client
module.exports.Pool = Pool
module.exports.Agent = Agent

module.exports.buildConnector = buildConnector
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
  return (url, opts, handler) => {
    if (typeof opts === 'function') {
      handler = opts
      opts = null
    }

    if (!url || (typeof url !== 'string' && typeof url !== 'object' && !(url instanceof URL))) {
      throw new InvalidArgumentError('invalid url')
    }

    if (opts != null && typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (opts && opts.path != null) {
      if (typeof opts.path !== 'string') {
        throw new InvalidArgumentError('invalid opts.path')
      }

      url = new URL(opts.path, util.parseOrigin(url))
    } else {
      if (!opts) {
        opts = typeof url === 'object' ? url : {}
      }

      url = util.parseURL(url)
    }

    const { agent, dispatcher = getGlobalDispatcher() } = opts

    if (agent) {
      throw new InvalidArgumentError('unsupported opts.agent. Did you mean opts.client?')
    }

    return fn.call(dispatcher, {
      ...opts,
      origin: url.origin,
      path: url.search ? `${url.pathname}${url.search}` : url.pathname,
      method: opts.method || (opts.body ? 'PUT' : 'GET')
    }, handler)
  }
}

module.exports.setGlobalDispatcher = setGlobalDispatcher
module.exports.getGlobalDispatcher = getGlobalDispatcher

if (nodeMajor > 16 || (nodeMajor === 16 && nodeMinor >= 5)) {
  const fetchImpl = require('./lib/fetch')
  module.exports.fetch = async function fetch (resource, init) {
    const dispatcher = getGlobalDispatcher()
    return fetchImpl.call(dispatcher, resource, init)
  }
  module.exports.Headers = require('./lib/fetch/headers').Headers
  module.exports.Response = require('./lib/fetch/response').Response
  module.exports.Request = require('./lib/fetch/request').Request
  module.exports.FormData = require('./lib/fetch/formdata').FormData
  module.exports.File = require('./lib/fetch/file').File
}

module.exports.request = makeDispatcher(api.request)
module.exports.stream = makeDispatcher(api.stream)
module.exports.pipeline = makeDispatcher(api.pipeline)
module.exports.connect = makeDispatcher(api.connect)
module.exports.upgrade = makeDispatcher(api.upgrade)

module.exports.MockClient = MockClient
module.exports.MockPool = MockPool
module.exports.MockAgent = MockAgent
module.exports.mockErrors = mockErrors
