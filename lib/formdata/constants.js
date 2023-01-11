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
  '-': 0x2D,
  cr: 0x0D,
  lf: 0x0A,
  ':': 0x3A,
  ' ': 0x20,
  ';': 0x3B,
  '=': 0x3D,
  '"': 0x22
}

const emptyBuffer = Buffer.alloc(0)

const crlfBuffer = Buffer.from([0x0D, 0x0A]) // \r\n

const maxHeaderLength = 16 * 1024

module.exports = {
  states,
  chars,
  headerStates,
  emptyBuffer,
  maxHeaderLength,
  crlfBuffer
}
