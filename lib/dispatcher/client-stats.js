'use strict'

const { kConnected, kPending, kRunning, kSize } = require('../core/symbols')
const kClient = Symbol('client')

class ClientStats {
  constructor (client) {
    this[kClient] = client
  }

  get connected () {
    return this[kClient][kConnected]
  }

  get pending () {
    return this[kClient][kPending]
  }

  get running () {
    return this[kClient][kRunning]
  }

  get size () {
    return this[kClient][kSize]
  }
}

module.exports = ClientStats
