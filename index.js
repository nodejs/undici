'use strict'

const Client = require('./lib/client')
const Pool = require('./lib/pool')
const errors = require('./lib/errors')

function undici (url, opts) {
  return new Pool(url, opts)
}

undici.Pool = Pool
undici.Client = Client
undici.errors = errors

module.exports = undici
