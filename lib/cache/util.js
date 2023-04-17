'use strict'

const { URLSerializer } = require('../fetch/dataURL')

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
  urlEquals
}
