'use strict'

function closeServerAsPromise (server) {
  return async () => {
    return new Promise((resolve) => {
      server.close(resolve)
    })
  }
}

module.exports = {
  closeServerAsPromise
}
