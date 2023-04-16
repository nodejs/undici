'use strict'

const { tmpdir } = require('os')
const { join } = require('path')
const { webidl } = require('../fetch/webidl')
const { URLSerializer } = require('../fetch/dataURL')
const { createHash } = require('crypto')

function toCacheName (V) {
  V = webidl.converters.DOMString(V)

  return createHash('MD5').update(V).digest('hex')
}

/**
 * @see https://url.spec.whatwg.org/#concept-url-equals
 * @param {URL} A
 * @param {URL} B
 * @param {boolean | undefined} excludeFragment
 * @returns {boolean}
 */
function urlEquals (A, B, excludeFragment = false) {
  const serializedA = URLSerializer(A, excludeFragment)

  const serializedB = URLSerializer(B, excludeFragment)

  return serializedA === serializedB
}

module.exports = {
  tmpdir: join(tmpdir(), 'undici-cache-storage'),
  toCacheName,
  urlEquals
}
