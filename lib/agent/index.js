'use strict'

const { InvalidArgumentError } = require('../core/errors')
const Pool = require('../client-pool')
const Client = require('../core/client')
const EventEmitter = require('events')
const util = require('../core/util')
const assert = require('assert')
const RedirectHandler = require('./redirect')

const kOnConnect = Symbol('onConnect')
const kOnDisconnect = Symbol('onDisconnect')
const kClients = Symbol('clients')
const kMaxRedirections = Symbol('maxRedirections')
const kFactory = Symbol('factory')
const kOptions = Symbol('options')

function defaultFactory (origin, opts) {
  return opts && opts.connections === 1
    ? new Client(origin, opts)
    : new Pool(origin, opts)
}

class Agent extends EventEmitter {
  constructor ({ factory = defaultFactory, maxRedirections = 0, ...options } = {}) {
    super()

    if (typeof factory !== 'function') {
      throw new InvalidArgumentError('factory must be a function.')
    }

    if (!Number.isInteger(maxRedirections) || maxRedirections < 0) {
      throw new InvalidArgumentError('maxRedirections must be a positive number')
    }

    this[kOptions] = JSON.parse(JSON.stringify(options))
    this[kMaxRedirections] = maxRedirections
    this[kFactory] = factory
    this[kClients] = new Map()

    const agent = this

    this[kOnConnect] = function onConnect (client) {
      agent.emit('connect', client)
    }

    this[kOnDisconnect] = function onDestroy (client, err) {
      if (this.connected === 0 && this.size === 0) {
        this.off('disconnect', agent[kOnDisconnect])
        agent[kClients].delete(this.origin)
      }

      agent.emit('disconnect', client, err)
    }
  }

  get (origin) {
    if (typeof origin !== 'string' || origin === '') {
      throw new InvalidArgumentError('Origin must be a non-empty string.')
    }

    let pool = this[kClients].get(origin)

    if (!pool) {
      pool = this[kFactory](origin, this[kOptions])
        .on('connect', this[kOnConnect])
        .on('disconnect', this[kOnDisconnect])

      this[kClients].set(origin, pool)
    }

    return pool
  }

  dispatch (opts, handler) {
    if (!handler || typeof handler !== 'object') {
      throw new InvalidArgumentError('handler')
    }

    try {
      if (!opts || typeof opts !== 'object') {
        throw new InvalidArgumentError('opts must be a object.')
      }

      const { maxRedirections = this[kMaxRedirections] } = opts

      if (!Number.isInteger(maxRedirections) || maxRedirections < 0) {
        throw new InvalidArgumentError('maxRedirections must be a positive number')
      }

      const client = this.get(opts.origin)

      if (!maxRedirections) {
        return client.dispatch(opts, handler)
      }

      if (util.isStream(opts.body) && util.bodyLength(opts.body) !== 0) {
        // TODO (fix): Provide some way for the user to cache the file to e.g. /tmp
        // so that it can be dispatched again?
        // TODO (fix): Do we need 100-expect support to provide a way to do this properly?
        return client.dispatch(opts, handler)
      }

      /* istanbul ignore next */
      if (util.isStream(opts.body)) {
        opts.body
          .on('data', function () {
            assert(false)
          })
      }

      client.dispatch(opts, new RedirectHandler(this, opts, handler))
    } catch (err) {
      if (typeof handler.onError !== 'function') {
        throw new InvalidArgumentError('invalid onError method')
      }

      handler.onError(err)
    }
  }

  close () {
    const closePromises = []
    for (const pool of this[kClients].values()) {
      closePromises.push(pool.close())
    }
    return Promise.all(closePromises)
  }

  destroy () {
    const destroyPromises = []
    for (const pool of this[kClients].values()) {
      destroyPromises.push(pool.destroy())
    }
    return Promise.all(destroyPromises)
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
