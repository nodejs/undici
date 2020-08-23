'use strict'

const Client = require('./core/client')
const {
  InvalidArgumentError
} = require('./core/errors')

const kClients = Symbol('clients')
const kQueue = Symbol('queue')
const kPendingIdx = Symbol('pending index')

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
        const { fn, args } = pool[kQueue][pool[kPendingIdx]]
        pool[kQueue][pool[kPendingIdx]++] = null
        fn.apply(this, args)
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
    enqueue(this, Client.prototype.dispatch, opts, handler)
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

function enqueue (pool, fn, ...args) {
  const client = pool[kClients].find(client => !client.busy)
  if (!client) {
    pool[kQueue].push({ fn, args })
  } else {
    fn.apply(client, args)
  }
}

module.exports = Pool
