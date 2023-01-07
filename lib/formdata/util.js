'use strict'

const { collectASequenceOfCodePoints } = require('../fetch/dataURL')

/**
 * Collect a string inside of quotes. Unlike
 * `collectAnHTTPQuotedString` from dataURL utilities,
 * this one does not remove backslashes.
 * @param {string} str
 */
function collectHTTPQuotedStringLenient (str) {
  if (str[0] !== '"') {
    return str
  }

  return collectASequenceOfCodePoints(
    (char) => char !== '"',
    str,
    { position: 1 }
  )
}

function findCharacterType (type) {
  switch (type) {
    case 'utf8':
    case 'utf-8':
      return 'utf-8'
    case 'latin1':
    case 'ascii':
      return 'latin1'
    default:
      return type.toLowerCase()
  }
}

module.exports = {
  collectHTTPQuotedStringLenient,
  findCharacterType
}
