'use strict'

const uid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

/** @type {PropertyDescriptor} */
const staticPropertyDescriptors = {
  enumerable: true,
  writable: false,
  configurable: false
}

const states = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
}

const opcodes = {
  CONTINUATION: 0x0,
  TEXT: 0x1,
  BINARY: 0x2,
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xA
}

module.exports = {
  uid,
  staticPropertyDescriptors,
  states,
  opcodes
}
