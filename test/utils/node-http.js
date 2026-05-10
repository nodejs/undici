'use strict'

const util = require('node:util')

const LOOPBACK_HOST = '127.0.0.1'

function closeServerAsPromise (server) {
  return () => {
    server.closeIdleConnections()
    return util.promisify(server.close.bind(server))()
  }
}

function closeClientAndServerAsPromise (client, server) {
  const closeClient = util.promisify(client.close.bind(client))
  const closeServer = util.promisify(server.close.bind(server))
  return async () => {
    await closeClient()
    await closeServer()
  }
}

module.exports = {
  LOOPBACK_HOST,
  closeServerAsPromise,
  closeClientAndServerAsPromise
}
