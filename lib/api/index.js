'use strict'

const nodeMajor = Number(process.versions.node.split('.')[0])

module.exports.request = require('./api-request')
module.exports.stream = require('./api-stream')
module.exports.pipeline = require('./api-pipeline')
module.exports.upgrade = require('./api-upgrade')
module.exports.connect = require('./api-connect')

if (nodeMajor >= 16) {
  module.exports.fetch = require('./api-fetch')
}
