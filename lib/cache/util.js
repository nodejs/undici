'use strict'

const { tmpdir } = require('os')
const { join } = require('path')
const { webidl } = require('../fetch/webidl')
const { createHash } = require('crypto')

function toCacheName (V) {
  V = webidl.converters.DOMString(V)

  return createHash('MD5').update(V).digest('hex')
}

module.exports = {
  tmpdir: join(tmpdir(), 'undici-cache-storage'),
  toCacheName
}
