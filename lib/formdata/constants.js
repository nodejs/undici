'use strict'

const states = {
  INITIAL: 0,
  BOUNDARY: 1,
  READ_HEADERS: 2,
  READ_BODY: 3
}

const headerStates = {
  DEFAULT: -1, // no match
  FIRST: 0,
  SECOND: 1,
  THIRD: 2
}

const chars = {
  '-': '-'.charCodeAt(0),
  cr: '\r'.charCodeAt(0),
  lf: '\n'.charCodeAt(0),
  ':': ':'.charCodeAt(0),
  ' ': ' '.charCodeAt(0), // 0x20
  ';': ';'.charCodeAt(0),
  '=': '='.charCodeAt(0),
  '"': '"'.charCodeAt(0)
}

const emptyBuffer = Buffer.alloc(0)

module.exports = {
  states,
  chars,
  headerStates,
  emptyBuffer
}
