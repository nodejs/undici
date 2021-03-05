'use strict'

const kCache = Symbol('cache')

class TLSSessionCache {
  constructor () {
    this[kCache] = new Map()
  }

  set (client, session) {
    if (session) {
      return this[kCache].set(client, session)
    } else {
      this[kCache].delete(client)
    }
  }

  delete (client) {
    return this[kCache].delete(client)
  }

  size () {
    return this[kCache].size
  }

  getSession () {
    return this[kCache].values().next().value
  }

  clear () {
    this[kCache].clear()
  }
}

module.exports = TLSSessionCache
