'use strict'

const { getGlobalDispatcher, setGlobalDispatcher } = require('./lib/global')
const EnvHttpProxyAgent = require('./lib/dispatcher/env-http-proxy-agent')
const fetchImpl = require('./lib/web/fetch').fetch

module.exports.fetch = function fetch (resource, init = undefined) {
  return fetchImpl(resource, init).catch((err) => {
    if (err && typeof err === 'object') {
      Error.captureStackTrace(err, this)
    }
    throw err
  })
}
module.exports.FormData = require('./lib/web/fetch/formdata').FormData
module.exports.Headers = require('./lib/web/fetch/headers').Headers
module.exports.Response = require('./lib/web/fetch/response').Response
module.exports.Request = require('./lib/web/fetch/request').Request

module.exports.WebSocket = require('./lib/web/websocket/websocket').WebSocket
module.exports.MessageEvent = require('./lib/web/websocket/events').MessageEvent

module.exports.EventSource = require('./lib/web/eventsource/eventsource').EventSource

// Expose the fetch implementation to be enabled in Node.js core via a flag
module.exports.EnvHttpProxyAgent = EnvHttpProxyAgent
module.exports.getGlobalDispatcher = getGlobalDispatcher
module.exports.setGlobalDispatcher = setGlobalDispatcher
