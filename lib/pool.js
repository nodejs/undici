'use strict'

const Client = require('./client')
const {
  InvalidArgumentError
} = require('./errors')
const {
  kClients,
  kQueue,
  kPendingIdx
} = require('./symbols')

class Pool {
  constructor (url, {
    connections,
    ...options
  } = {}) {
    if (connections != null && (!Number.isFinite(connections) || connections <= 0)) {
      throw new InvalidArgumentError('invalid connections')
    }

    this[kQueue] = []
    this[kPendingIdx] = 0
    this[kClients] = Array.from({
      length: connections || 10
    }, () => new Client(url, options))

    const pool = this
    function onDrain () {
      while (pool[kPendingIdx] < pool[kQueue].length && !this.busy) {
        const { opts, handler } = pool[kQueue][pool[kPendingIdx]]
        pool[kQueue][pool[kPendingIdx]++] = null
        this.dispatch(opts, handler)
      }

      if (pool[kPendingIdx] > 256) {
        pool[kQueue].splice(0, pool[kPendingIdx])
        pool[kPendingIdx] = 0
      }
    }

    for (const client of this[kClients]) {
      client.on('drain', onDrain)
    }
  }

  dispatch (opts, handler) {
    const client = this[kClients].find(client => !client.busy)
    if (!client) {
      this[kQueue].push({ opts, handler })
    } else {
      client.dispatch(opts, handler)
    }
  }

  close (cb) {
    const promise = Promise.all(this[kClients].map(c => c.close()))
    if (cb) {
      promise.then(() => cb(null, null), (err) => cb(err, null))
    } else {
      return promise
    }
  }

  destroy (err, cb) {
    if (typeof err === 'function') {
      cb = err
      err = null
    }

    const promise = Promise.all(this[kClients].map(c => c.destroy(err)))
    if (cb) {
      promise.then(() => cb(null, null))
    } else {
      return promise
    }
  }
}

module.exports = Pool
