'use strict'

const Client = require('./lib/core/client')
const errors = require('./lib/core/errors')
const Pool = require('./lib/pool')
// const { Agent, request, stream, pipeline, setGlobalAgent } = require('./lib/agent')

Client.prototype.request = require('./lib/client-request')
Client.prototype.stream = require('./lib/client-stream')
Client.prototype.pipeline = require('./lib/client-pipeline')
Client.prototype.upgrade = require('./lib/client-upgrade')
Client.prototype.connect = require('./lib/client-connect')

Pool.prototype.request = require('./lib/client-request')
Pool.prototype.stream = require('./lib/client-stream')
Pool.prototype.pipeline = require('./lib/client-pipeline')
Pool.prototype.upgrade = require('./lib/client-upgrade')
Pool.prototype.connect = require('./lib/client-connect')

function undici (url, opts) {
  return new Pool(url, opts)
}

undici.Pool = Pool
undici.Client = Client
undici.errors = errors

// undici.Agent = Agent
// undici.request = request
// undici.stream = stream
// undici.pipeline = pipeline
// undici.setGlobalAgent = setGlobalAgent

module.exports = undici
