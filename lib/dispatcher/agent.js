'use strict'

const { InvalidArgumentError } = require('../core/errors')
const { kClients, kRunning, kClose, kDestroy, kDispatch, kUrl, kQueue, kResume } = require('../core/symbols')
const DispatcherBase = require('./dispatcher-base')
const Pool = require('./pool')
const Client = require('./client')
const util = require('../core/util')

const kOnConnect = Symbol('onConnect')
const kOnDisconnect = Symbol('onDisconnect')
const kOnConnectionError = Symbol('onConnectionError')
const kOnDrain = Symbol('onDrain')
const kFactory = Symbol('factory')
const kOptions = Symbol('options')
const kOrigins = Symbol('origins')

function defaultFactory (origin, opts) {
  return opts && (opts.connections === 1 || opts.origins === 1)
    ? new Client(origin, opts)
    : new Pool(origin, opts)
}

class Agent extends DispatcherBase {
  constructor ({ factory = defaultFactory, connect, ...options } = {}) {
    if (typeof factory !== 'function') {
      throw new InvalidArgumentError('factory must be a function.')
    }

    if (connect != null && typeof connect !== 'function' && typeof connect !== 'object') {
      throw new InvalidArgumentError('connect must be a function or an object')
    }

    super()

    if (connect && typeof connect !== 'function') {
      connect = { ...connect }
    }

    this[kOptions] = { ...util.deepClone(options), connect }
    this[kFactory] = factory
    this[kClients] = new Map()
    this[kQueue] = []
    this[kOrigins] = new Set()

    if (options.origins != null) {
      if (Number.isNaN(options.origins) || options.origins <= 0) {
        throw new InvalidArgumentError('origins must be a number greater than 0')
      }
    } else {
      options.origins = Infinity
    }

    this[kOptions].maxOriginsReached = () => {
      return (this[kOrigins].size >= options.origins)
    }

    this[kOnDrain] = (origin, targets) => {
      this.emit('drain', origin.origin, [this, ...targets])
    }

    this[kOnConnect] = (origin, targets) => {
      const key = origin.origin
      const result = this[kClients].get(key)
      if (result) {
        result.count += 1
      }
      this.emit('connect', key, [this, ...targets])
    }

    this[kOnDisconnect] = (origin, targets, err) => {
      const key = origin.origin
      const result = this[kClients].get(key)
      if (result) {
        result.count -= 1
        if (result.count <= 0) {
          if (err?.code !== 'UND_ERR_INFO') {
            this[kClients].delete(key)
            result.dispatcher.destroy()
          }
          this[kOrigins].delete(key)
        }
      }
      this.emit('disconnect', key, [this, ...targets], err)
      this[kResume]()
    }

    this[kOnConnectionError] = (origin, targets, err) => {
      // TODO: should this decrement result.count here?
      this.emit('connectionError', origin.origin, [this, ...targets], err)
    }
  }

  [kResume] () {
    for (const { dispatcher } of this[kClients].values()) {
      dispatcher[kResume](true)
    }

    while (this[kQueue].length > 0) {
      const { opts, handler } = this[kQueue].shift()
      const result = this[kDispatch](opts, handler)
      if (!result) {
        break
      }
    }
  }

  get [kRunning] () {
    let ret = 0
    for (const { dispatcher } of this[kClients].values()) {
      ret += dispatcher[kRunning]
    }
    return ret
  }

  [kDispatch] (opts, handler) {
    let key
    if (opts.origin && (typeof opts.origin === 'string' || opts.origin instanceof URL)) {
      key = String(opts.origin)
    } else {
      throw new InvalidArgumentError('opts.origin must be a non-empty string or URL.')
    }

    if (this[kOptions].maxOriginsReached() && !this[kOrigins].has(key)) {
      this[kQueue].push({ opts, handler })
      return false
    }

    const result = this[kClients].get(key)
    let dispatcher = result && result.dispatcher
    if (!dispatcher) {
      dispatcher = this[kFactory](opts.origin, this[kOptions])
        .on('drain', this[kOnDrain])
        .on('connect', this[kOnConnect])
        .on('disconnect', this[kOnDisconnect])
        .on('connectionError', this[kOnConnectionError])

      this[kClients].set(key, { count: 0, dispatcher })
      this[kOrigins].add(key)
    }

    return dispatcher.dispatch(opts, handler)
  }

  async [kClose] () {
    const closePromises = []
    for (const { dispatcher } of this[kClients].values()) {
      closePromises.push(dispatcher.close())
    }
    this[kClients].clear()

    await Promise.all(closePromises)
  }

  async [kDestroy] (err) {
    const destroyPromises = []
    for (const { dispatcher } of this[kClients].values()) {
      destroyPromises.push(dispatcher.destroy(err))
    }
    this[kClients].clear()

    await Promise.all(destroyPromises)
  }

  get stats () {
    const allClientStats = {}
    for (const { dispatcher } of this[kClients].values()) {
      if (dispatcher.stats) {
        allClientStats[dispatcher[kUrl].origin] = dispatcher.stats
      }
    }
    return allClientStats
  }
}

module.exports = Agent
