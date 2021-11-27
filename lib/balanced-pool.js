'use strict'

const {
  BalancedPoolMissingUpstreamError,
  ClientClosedError,
  InvalidArgumentError,
  ClientDestroyedError
} = require('./core/errors')
const Dispatcher = require('./dispatcher')
const Pool = require('./pool')
const FixedQueue = require('./node/fixed-queue')

const kQueue = Symbol('kQueue')
const kClients = Symbol('kClients')
const kClientsOpts = Symbol('kClientsOpts')
const kDestroyed = Symbol('destroyed')
const kUpstream = Symbol('kUpstream')
const kNeedDrain = Symbol('kNeedDrain')
const kClosedPromise = Symbol('closed promise')
const kClosedResolve = Symbol('closed resolve')
const kOnDrain = Symbol('onDrain')
const kOnConnect = Symbol('onConnect')
const kOnDisconnect = Symbol('onDisconnect')
const kOnConnectionError = Symbol('onConnectionError')
const kQueued = Symbol('queued')

class BalancedPool extends Dispatcher {
  constructor (upstreams = [], opts = {}) {
    super()

    this[kClients] = []
    this[kClientsOpts] = opts
    this[kQueue] = new FixedQueue()
    this[kClosedPromise] = null
    this[kClosedResolve] = null
    this[kDestroyed] = false
    this[kNeedDrain] = false
    this[kQueued] = 0

    const pool = this

    this[kOnDrain] = function onDrain (origin, targets) {
      const queue = pool[kQueue]

      let needDrain = false

      while (!needDrain) {
        const item = queue.shift()
        if (!item) {
          break
        }
        pool[kQueued]--
        needDrain = !this.dispatch(item.opts, item.handler)
      }

      this[kNeedDrain] = needDrain

      if (!this[kNeedDrain] && pool[kNeedDrain]) {
        pool[kNeedDrain] = false
        pool.emit('drain', origin, [pool, ...targets])
      }

      if (pool[kClosedResolve] && queue.isEmpty()) {
        Promise
          .all(pool[kClients].map(c => c.close()))
          .then(pool[kClosedResolve])
      }
    }

    this[kOnConnect] = (origin, targets) => {
      pool.emit('connect', origin, [pool, ...targets])
    }

    this[kOnDisconnect] = (origin, targets, err) => {
      pool.emit('disconnect', origin, [pool, ...targets], err)
    }

    this[kOnConnectionError] = (origin, targets, err) => {
      pool.emit('connectionError', origin, [pool, ...targets], err)
    }

    if (!Array.isArray(upstreams)) {
      upstreams = [upstreams]
    }

    for (const upstream of upstreams) {
      this.addUpstream(upstream)
    }
  }

  addUpstream (upstream) {
    if (this[kClients].find((pool) => pool[kUpstream] === upstream)) {
      return this
    }

    const pool = new Pool(upstream, Object.assign({}, this[kClientsOpts]))
      .on('drain', this[kOnDrain])
      .on('connect', this[kOnConnect])
      .on('disconnect', this[kOnDisconnect])
      .on('connectionError', this[kOnConnectionError])

    pool[kUpstream] = upstream

    this[kClients].push(pool)
    return this
  }

  dispatch (opts, handler) {
    // We validate that pools is greater than 0,
    // otherwise we would have to wait until an upstream
    // is added, which might never happen.
    if (this[kClients].length === 0) {
      throw new BalancedPoolMissingUpstreamError()
    }

    if (!handler || typeof handler !== 'object') {
      throw new InvalidArgumentError('handler must be an object')
    }

    try {
      if (this[kDestroyed]) {
        throw new ClientDestroyedError()
      }

      if (this[kClosedPromise]) {
        throw new ClientClosedError()
      }

      let dispatcher = this[kClients].find(dispatcher => !dispatcher[kNeedDrain])

      if (!dispatcher) {
        this[kNeedDrain] = true
        this[kQueue].push({ opts, handler })
        this[kQueued]++
      } else if (!dispatcher.dispatch(opts, handler)) {
        dispatcher[kNeedDrain] = true
      }

      if (dispatcher) {
        this[kClients].splice(this[kClients].indexOf(dispatcher), 1)
        this[kClients].push(dispatcher)
      }
    } catch (err) {
      if (typeof handler.onError !== 'function') {
        throw new InvalidArgumentError('invalid onError method')
      }

      handler.onError(err)
    }

    return !this[kNeedDrain]
  }

  removeUpstream (upstream) {
    const pool = this[kClients].find((pool) => pool[kUpstream] === upstream)
    const idx = this[kClients].indexOf(pool)
    this[kClients].splice(idx, 1)
    pool.close()
    return this
  }

  get upstreams () {
    return this[kClients].map((p) => p[kUpstream])
  }

  get destroyed () {
    return this[kDestroyed]
  }

  get closed () {
    return this[kClosedPromise] != null
  }

  close (cb) {
    try {
      if (this[kDestroyed]) {
        throw new ClientDestroyedError()
      }

      if (!this[kClosedPromise]) {
        if (this[kQueue].isEmpty()) {
          this[kClosedPromise] = Promise.all(this[kClients].map(c => c.close()))
        } else {
          this[kClosedPromise] = new Promise((resolve) => {
            this[kClosedResolve] = resolve
          })
        }
        this[kClosedPromise] = this[kClosedPromise].then(() => {
          this[kDestroyed] = true
        })
      }

      if (cb) {
        this[kClosedPromise].then(() => cb(null, null))
      } else {
        return this[kClosedPromise]
      }
    } catch (err) {
      if (cb) {
        cb(err)
      } else {
        return Promise.reject(err)
      }
    }
  }

  destroy (err, cb) {
    this[kDestroyed] = true

    if (typeof err === 'function') {
      cb = err
      err = null
    }

    if (!err) {
      err = new ClientDestroyedError()
    }

    while (true) {
      const item = this[kQueue].shift()
      if (!item) {
        break
      }
      item.handler.onError(err)
    }

    const promise = Promise.all(this[kClients].map(c => c.destroy(err)))
    if (cb) {
      promise.then(() => cb(null, null))
    } else {
      return promise
    }
  }
}

module.exports = BalancedPool
