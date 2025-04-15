'use strict'

const {
  kConnected,
  kPending,
  kRunning,
  kSize,
  kFree,
  kQueued
} = require('../core/symbols')

const kPool = Symbol('pool')
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

class PoolStats {
  constructor (pool) {
    this[kPool] = pool
  }

  get connected () {
    return this[kPool][kConnected]
  }

  get free () {
    return this[kPool][kFree]
  }

  get pending () {
    return this[kPool][kPending]
  }

  get queued () {
    return this[kPool][kQueued]
  }

  get running () {
    return this[kPool][kRunning]
  }

  get size () {
    return this[kPool][kSize]
  }
}

module.exports = { ClientStats, PoolStats }
