const util = require('node:util')

function closeServerAsPromise (server) {
  return () => util.promisify(server.close.bind(server))()
}

module.exports = {
  closeServerAsPromise
}
