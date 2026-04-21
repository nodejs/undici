'use strict'

const { InvalidArgumentError, MaxOriginsReachedError } = require('../core/errors')
const {
  kClients,
  kHttp1OnlyClients,
  kRunning,
  kClose,
  kDestroy,
  kDispatch,
  kUrl,
  kGetDispatcherEntry,
  kSetDispatcherEntry,
  kDeleteDispatcherEntry,
  kHasDispatcherForOrigin,
  kForEachDispatcherEntry
} = require('../core/symbols')
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
  return opts && opts.connections === 1
    ? new Client(origin, opts)
    : new Pool(origin, opts)
}

function shouldUseHttp1OnlyClients (allowH2) {
  return allowH2 === false
}

class Agent extends DispatcherBase {
  constructor ({ factory = defaultFactory, maxOrigins = Infinity, connect, ...options } = {}) {
    if (typeof factory !== 'function') {
      throw new InvalidArgumentError('factory must be a function.')
    }

    if (connect != null && typeof connect !== 'function' && typeof connect !== 'object') {
      throw new InvalidArgumentError('connect must be a function or an object')
    }

    if (typeof maxOrigins !== 'number' || Number.isNaN(maxOrigins) || maxOrigins <= 0) {
      throw new InvalidArgumentError('maxOrigins must be a number greater than 0')
    }

    super(options)

    if (connect && typeof connect !== 'function') {
      connect = { ...connect }
    }

    this[kOptions] = { ...util.deepClone(options), maxOrigins, connect }
    this[kFactory] = factory
    this[kClients] = new Map()
    this[kHttp1OnlyClients] = new Map()
    this[kOrigins] = new Set()

    this[kOnDrain] = (origin, targets) => {
      this.emit('drain', origin, [this, ...targets])
    }

    this[kOnConnect] = (origin, targets) => {
      this.emit('connect', origin, [this, ...targets])
    }

    this[kOnDisconnect] = (origin, targets, err) => {
      this.emit('disconnect', origin, [this, ...targets], err)
    }

    this[kOnConnectionError] = (origin, targets, err) => {
      this.emit('connectionError', origin, [this, ...targets], err)
    }
  }

  get [kRunning] () {
    let ret = 0

    this[kForEachDispatcherEntry](({ dispatcher }) => {
      ret += dispatcher[kRunning]
    })

    return ret
  }

  [kGetDispatcherEntry] (origin, { allowH2 } = {}) {
    return (shouldUseHttp1OnlyClients(allowH2) ? this[kHttp1OnlyClients] : this[kClients]).get(origin)
  }

  [kSetDispatcherEntry] (origin, { allowH2 } = {}, entry) {
    ;(shouldUseHttp1OnlyClients(allowH2) ? this[kHttp1OnlyClients] : this[kClients]).set(origin, entry)
    this[kOrigins].add(origin)
  }

  [kDeleteDispatcherEntry] (origin, { allowH2 } = {}) {
    ;(shouldUseHttp1OnlyClients(allowH2) ? this[kHttp1OnlyClients] : this[kClients]).delete(origin)

    if (!this[kHasDispatcherForOrigin](origin)) {
      this[kOrigins].delete(origin)
    }
  }

  [kHasDispatcherForOrigin] (origin) {
    return this[kClients].has(origin) || this[kHttp1OnlyClients].has(origin)
  }

  [kForEachDispatcherEntry] (callback) {
    for (const [origin, entry] of this[kClients]) {
      callback(entry, { origin })
    }

    for (const [origin, entry] of this[kHttp1OnlyClients]) {
      callback(entry, { origin, allowH2: false })
    }
  }

  [kDispatch] (opts, handler) {
    let origin
    if (opts.origin && (typeof opts.origin === 'string' || opts.origin instanceof URL)) {
      origin = String(opts.origin)
    } else {
      throw new InvalidArgumentError('opts.origin must be a non-empty string or URL.')
    }

    const allowH2 = opts.allowH2 ?? this[kOptions].allowH2
    const registry = { allowH2 }

    if (this[kOrigins].size >= this[kOptions].maxOrigins && !this[kOrigins].has(origin)) {
      throw new MaxOriginsReachedError()
    }

    const result = this[kGetDispatcherEntry](origin, registry)
    let dispatcher = result && result.dispatcher
    if (!dispatcher) {
      const closeClientIfUnused = (connected) => {
        const result = this[kGetDispatcherEntry](origin, registry)
        if (result) {
          if (connected) result.count -= 1
          if (result.count <= 0) {
            this[kDeleteDispatcherEntry](origin, registry)
            if (!result.dispatcher.destroyed) {
              result.dispatcher.close()
            }
          }
        }
      }

      dispatcher = this[kFactory](opts.origin, allowH2 === false
        ? { ...this[kOptions], allowH2: false }
        : this[kOptions])
        .on('drain', this[kOnDrain])
        .on('connect', (origin, targets) => {
          const result = this[kGetDispatcherEntry](origin, registry)
          if (result) {
            result.count += 1
          }
          this[kOnConnect](origin, targets)
        })
        .on('disconnect', (origin, targets, err) => {
          closeClientIfUnused(true)
          this[kOnDisconnect](origin, targets, err)
        })
        .on('connectionError', (origin, targets, err) => {
          closeClientIfUnused(false)
          this[kOnConnectionError](origin, targets, err)
        })

      this[kSetDispatcherEntry](origin, registry, { count: 0, dispatcher, origin })
    }

    return dispatcher.dispatch(opts, handler)
  }

  [kClose] () {
    const closePromises = []

    this[kForEachDispatcherEntry](({ dispatcher }) => {
      closePromises.push(dispatcher.close())
    })

    this[kClients].clear()
    this[kHttp1OnlyClients].clear()
    this[kOrigins].clear()

    return Promise.all(closePromises)
  }

  [kDestroy] (err) {
    const destroyPromises = []

    this[kForEachDispatcherEntry](({ dispatcher }) => {
      destroyPromises.push(dispatcher.destroy(err))
    })

    this[kClients].clear()
    this[kHttp1OnlyClients].clear()
    this[kOrigins].clear()

    return Promise.all(destroyPromises)
  }

  get stats () {
    const allClientStats = {}

    this[kForEachDispatcherEntry](({ dispatcher }) => {
      if (dispatcher.stats) {
        allClientStats[dispatcher[kUrl].origin] = dispatcher.stats
      }
    })

    return allClientStats
  }
}

module.exports = Agent
