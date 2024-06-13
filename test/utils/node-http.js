'use strict'

const util = require('node:util')

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
  closeServerAsPromise,
  closeClientAndServerAsPromise
}
