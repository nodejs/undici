'use strict'

const EventEmitter = require('events')
const Client = require('./core/client')
const {
  ClientClosedError,
  InvalidArgumentError,
  ClientDestroyedError
} = require('./core/errors')
const FixedQueue = require('./node/fixed-queue')
const util = require('./core/util')

const kClients = Symbol('clients')
const kNeedDrain = Symbol('needDrain')
const kQueue = Symbol('queue')
const kDestroyed = Symbol('destroyed')
const kClosedPromise = Symbol('closed promise')
const kClosedResolve = Symbol('closed resolve')
const kOptions = Symbol('options')
const kUrl = Symbol('url')
const kOnDrain = Symbol('onDrain')
const kOnConnect = Symbol('onConnect')
const kOnDisconnect = Symbol('onDisconnect')
const kPending = Symbol('pending')
const kConnected = Symbol('connected')
const kConnections = Symbol('connections')

class Pool extends EventEmitter {
  constructor (origin, { connections, ...options } = {}) {
    super()

    if (connections != null && (!Number.isFinite(connections) || connections < 0)) {
      throw new InvalidArgumentError('invalid connections')
    }

    this[kConnections] = connections || null
    this[kUrl] = util.parseOrigin(origin)
    this[kOptions] = JSON.parse(JSON.stringify(options))
    this[kQueue] = new FixedQueue()
    this[kClosedPromise] = null
    this[kClosedResolve] = null
    this[kDestroyed] = false
    this[kClients] = []
    this[kNeedDrain] = false
    this[kPending] = 0
    this[kConnected] = 0

    const pool = this

    this[kOnDrain] = function onDrain () {
      const queue = pool[kQueue]

      while (!this.busy) {
        const item = queue.shift()
        if (!item) {
          break
        }
        pool[kPending]--
        this.dispatch(item.opts, item.handler)
      }

      if (pool[kNeedDrain] && !this.busy) {
        pool[kNeedDrain] = false
        pool.emit('drain')
      }

      if (pool[kClosedResolve] && queue.isEmpty()) {
        Promise
          .all(pool[kClients].map(c => c.close()))
          .then(pool[kClosedResolve])
      }
    }

    this[kOnConnect] = function onConnect () {
      pool[kConnected]++
      pool.emit('connect', this)
    }

    this[kOnDisconnect] = function onDisconnect (err) {
      pool[kConnected]--
      pool.emit('disconnect', this, err)
    }
  }

  get url () {
    return this[kUrl]
  }

  get connected () {
    return this[kConnected]
  }

  get busy () {
    if (this[kPending] > 0) {
      return true
    }

    if (this[kConnections] && this[kClients].length === this[kConnections]) {
      for (const { busy } of this[kClients]) {
        if (!busy) {
          return false
        }
      }
      return true
    }

    return false
  }

  get pending () {
    let ret = this[kPending]

    for (const { pending } of this[kClients]) {
      ret += pending
    }

    return ret
  }

  get running () {
    let ret = 0

    for (const { running } of this[kClients]) {
      ret += running
    }

    return ret
  }

  get size () {
    let ret = this[kPending]

    for (const { size } of this[kClients]) {
      ret += size
    }

    return ret
  }

  get destroyed () {
    return this[kDestroyed]
  }

  get closed () {
    return this[kClosedPromise] != null
  }

  dispatch (opts, handler) {
    try {
      if (this[kDestroyed]) {
        throw new ClientDestroyedError()
      }

      if (this[kClosedPromise]) {
        throw new ClientClosedError()
      }

      let client = this[kClients].find(client => !client.busy)

      if (!client) {
        if (!this[kConnections] || this[kClients].length < this[kConnections]) {
          client = new Client(this[kUrl], this[kOptions])
            .on('drain', this[kOnDrain])
            .on('connect', this[kOnConnect])
            .on('disconnect', this[kOnDisconnect])

          this[kClients].push(client)
        }
      }

      if (!client) {
        this[kNeedDrain] = true
        this[kQueue].push({ opts, handler })
        this[kPending]++
      } else {
        client.dispatch(opts, handler)
        if (client.busy && this.busy) {
          this[kNeedDrain] = true
        }
      }
    } catch (err) {
      if (typeof handler.onError !== 'function') {
        throw new InvalidArgumentError('invalid onError method')
      }

      handler.onError(err)
    }
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

Pool.prototype.request = require('./client-request')
Pool.prototype.stream = require('./client-stream')
Pool.prototype.pipeline = require('./client-pipeline')
Pool.prototype.upgrade = require('./client-upgrade')
Pool.prototype.connect = require('./client-connect')

module.exports = Pool
