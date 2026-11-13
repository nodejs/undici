'use strict'

const { getMiloEnabled } = require('../../lib/dispatcher/parser-h1.js')

// Whether the HTTP/1.1 clients in this process use the experimental Milo
// parser, as decided by UNDICI_USE_MILO. Use it to skip tests for behaviors
// that Milo intentionally does not support.
module.exports = {
  miloEnabled: getMiloEnabled()
}
