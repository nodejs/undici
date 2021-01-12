'use strict'

const EventEmitter = require('events')
const Client = require('./core/client')
const {
  ClientClosedError,
  InvalidArgumentError,
  ClientDestroyedError
} = require('./core/errors')
const FixedQueue = require('./node/fixed-queue')

const kClients = Symbol('clients')
const kQueue = Symbol('queue')
const kDestroyed = Symbol('destroyed')
const kClosedPromise = Symbol('closed promise')
const kClosedResolve = Symbol('closed resolve')
const kOptions = Symbol('options')
const kUrl = Symbol('url')
const kOnDrain = Symbol('onDrain')
const kOnConnect = Symbol('onConnect')
const kOnDisconnect = Symbol('onDisconnect')

class Pool extends EventEmitter {
  constructor (url, options = {}) {
    super()

    const { connections } = options

    if (connections != null && (!Number.isFinite(connections) || connections < 0)) {
      throw new InvalidArgumentError('invalid connections')
    }

    this[kUrl] = url
    this[kOptions] = JSON.parse(JSON.stringify(options))
    this[kQueue] = new FixedQueue()
    this[kClosedPromise] = null
    this[kClosedResolve] = null
    this[kDestroyed] = false
    this[kClients] = []

    const pool = this

    this[kOnDrain] = function onDrain () {
      const queue = pool[kQueue]

      while (!this.busy) {
        const item = queue.shift()
        if (!item) {
          break
        }
        this.dispatch(item.opts, item.handler)
      }

      if (pool[kClosedResolve] && queue.isEmpty()) {
        Promise
          .all(pool[kClients].map(c => c.close()))
          .then(pool[kClosedResolve])
      }
    }

    this[kOnConnect] = function onConnect () {
      pool.emit('connect', this)
    }

    this[kOnDisconnect] = function onDisconnect () {
      pool.emit('disconnect', this)
    }
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
        const { connections, ...options } = this[kOptions]
        if (!connections || this[kClients].length < connections) {
          client = new Client(this[kUrl], options)
            .on('drain', this[kOnDrain])
            .on('connect', this[kOnConnect])
            .on('disconnect', this[kOnDisconnect])

          this[kClients].push(client)
        }
      }

      if (!client) {
        this[kQueue].push({ opts, handler })
      } else {
        client.dispatch(opts, handler)
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
