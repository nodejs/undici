'use strict'

const Client = require('./lib/client')
const Pool = require('./lib/pool')

function undici (url, opts) {
  return new Pool(url, opts)
}

undici.Pool = Pool
undici.Client = Client

module.exports = undici
