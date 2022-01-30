'use strict'

const Agent = require('./lib/agent')

const globalDispatcher = new Agent()

let fetchImpl = null
module.exports.fetch = async function fetch (resource, init) {
  if (!fetchImpl) {
    fetchImpl = require('./lib/fetch')
  }
  return fetchImpl.call(globalDispatcher, resource, init)
}
module.exports.Headers = require('./lib/fetch/headers').Headers
module.exports.Response = require('./lib/fetch/response').Response
module.exports.Request = require('./lib/fetch/request').Request
