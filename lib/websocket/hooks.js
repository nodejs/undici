'use strict'

const assert = require('assert')
const { isValidUTF8 } = require('./util')

/** @type {Map<string, (buffer: Buffer) => boolean} */
const hooks = new Map([
  ['utf-8', isValidUTF8]
])

const WebsocketHooks = {
  set (name, value) {
    if (name === 'utf-8') {
      assert(typeof value === 'function' || value == null)
      hooks.set(name, value ?? isValidUTF8)
    }
  },

  get (name) {
    return hooks.get(name)
  }
}

module.exports = {
  WebsocketHooks
}
