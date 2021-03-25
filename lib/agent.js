'use strict'
const { InvalidArgumentError } = require('./core/errors')
const Pool = require('./client-pool')
const Client = require('./core/client')
const EventEmitter = require('events')

const kOnConnect = Symbol('onConnect')
const kOnDisconnect = Symbol('onDisconnect')
const kCache = Symbol('cache')
const kFactory = Symbol('factory')

function defaultFactory (origin, opts) {
  return opts && opts.connections === 1
    ? new Client(origin, opts)
    : new Pool(origin, opts)
}

class Agent extends EventEmitter {
  constructor ({ factory = defaultFactory, ...opts } = {}) {
    super()

    if (typeof factory !== 'function') {
      throw new InvalidArgumentError('factory must be a function.')
    }

    this[kFactory] = (origin) => factory(origin, opts)
    this[kCache] = new Map()

    const agent = this

    this[kOnConnect] = function onConnect (client) {
      agent.emit('connect', client)
    }

    this[kOnDisconnect] = function onDestroy (client, err) {
      if (this.connected === 0 && this.size === 0) {
        this.off('disconnect', agent[kOnDisconnect])
        agent[kCache].delete(this.origin)
      }

      agent.emit('disconnect', client, err)
    }
  }

  get (origin) {
    if (typeof origin !== 'string' || origin === '') {
      throw new InvalidArgumentError('Origin must be a non-empty string.')
    }

    let pool = this[kCache].get(origin)

    if (!pool) {
      pool = this[kFactory](origin)
        .on('connect', this[kOnConnect])
        .on('disconnect', this[kOnDisconnect])

      this[kCache].set(origin, pool)
    }

    return pool
  }

  close (callback) {
    if (typeof callback !== 'undefined' && typeof callback !== 'function') {
      throw new InvalidArgumentError('must be a function')
    }
    const closePromises = []
    for (const pool of this[kCache].values()) {
      closePromises.push(pool.close())
    }
    if (callback === undefined) {
      return Promise.all(closePromises)
    }

    Promise.all(closePromises)
      .then(() => process.nextTick(callback()))
      .catch((err) => process.nextTick(callback(err)))
  }

  destroy (callback) {
    if (typeof callback !== 'undefined' && typeof callback !== 'function') {
      throw new InvalidArgumentError('callback must be a function')
    }
    const destroyPromises = []
    for (const pool of this[kCache].values()) {
      destroyPromises.push(pool.destroy())
    }
    if (callback === undefined) {
      return Promise.all(destroyPromises)
    }
    Promise.all(destroyPromises)
      .then(() => process.nextTick(callback()))
      .catch((error) => process.nextTick(callback(error)))
  }
}

let globalAgent = new Agent({ connections: null })

function setGlobalAgent (agent) {
  if (!agent || typeof agent.get !== 'function') {
    throw new InvalidArgumentError('Argument agent must implement Agent')
  }
  globalAgent = agent
}

function getGlobalAgent () {
  return globalAgent
}

module.exports = {
  setGlobalAgent,
  getGlobalAgent,
  Agent
}
