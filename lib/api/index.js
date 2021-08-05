'use strict'

const nodeMajor = Number(process.versions.node.split('.')[0])

module.exports.request = require('./api-request')
module.exports.stream = require('./api-stream')
module.exports.pipeline = require('./api-pipeline')
module.exports.upgrade = require('./api-upgrade')
module.exports.connect = require('./api-connect')

if (nodeMajor >= 16) {
  module.exports.fetch = require('./api-fetch')
  module.exports.fetch.Headers = require('./api-fetch/headers').Headers
  module.exports.fetch.Response = require('./api-fetch/response').Response
  module.exports.fetch.Request = require('./api-fetch/request').Request
}
