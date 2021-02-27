'use strict'

// TODO: This is not really allowed by Node but it works for now.
const common = require('_http_common')

if (common.HTTPParser) {
  module.exports = common.HTTPParser
} else {
  // Node 10
  module.exports = process.binding('http_parser').HTTPParser // eslint-disable-line
}
