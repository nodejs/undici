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

module.exports = {
  collectHTTPQuotedStringLenient
}
