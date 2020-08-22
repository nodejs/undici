'use strict'

const Client = require('./lib/core/client')
const errors = require('./lib/core/errors')
const Pool = require('./lib/pool')

Client.prototype.request = require('./lib/client-request').request
Client.prototype.stream = require('./lib/client-stream').stream
Client.prototype.pipeline = require('./lib/client-pipeline').pipeline
Client.prototype.upgrade = require('./lib/client-upgrade').upgrade
Client.prototype.connect = require('./lib/client-connect').connect

function undici (url, opts) {
  return new Pool(url, opts)
}

undici.Pool = Pool
undici.Client = Client
undici.errors = errors

module.exports = undici
