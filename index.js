'use strict'

const Client = require('./lib/core/client')
const errors = require('./lib/core/errors')
const Pool = require('./lib/pool')
const { Agent, request, stream, pipeline, setGlobalAgent } = require('./lib/agent')
const RedirectPool = require('./lib/redirect-pool')

Client.prototype.request = require('./lib/client-request')
Client.prototype.stream = require('./lib/client-stream')
Client.prototype.pipeline = require('./lib/client-pipeline')
Client.prototype.upgrade = require('./lib/client-upgrade')
Client.prototype.connect = require('./lib/client-connect')

function undici (url, opts) {
  return new Pool(url, opts)
}

module.exports = undici

module.exports.Pool = Pool
module.exports.RedirectPool = RedirectPool
module.exports.Client = Client
module.exports.errors = errors

module.exports.Agent = Agent
module.exports.request = request
module.exports.stream = stream
module.exports.pipeline = pipeline
module.exports.setGlobalAgent = setGlobalAgent
