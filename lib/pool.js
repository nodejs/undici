'use strict'

const Client = require('./core/client')
const {
  InvalidArgumentError
} = require('./core/errors')
const FixedQueue = require('./core/node/fixed-queue')

const { kTLSSession } = require('./core/symbols')
const kClients = Symbol('clients')
const kQueue = Symbol('queue')

class Pool {
  constructor (url, {
    connections,
    ...options
  } = {}) {
    if (connections != null && (!Number.isFinite(connections) || connections <= 0)) {
      throw new InvalidArgumentError('invalid connections')
    }

    this[kQueue] = new FixedQueue()
    this[kClients] = Array.from({
      length: connections || 10
    }, () => new Client(url, options))

    const queue = this[kQueue]
    const clients = this[kClients]
    function onDrain () {
      while (!this.busy) {
        const item = queue.shift()
        if (!item) {
          return
        }
        this.dispatch(item.opts, item.handler)
      }
    }

    function onTLSSession (session) {
      for (const client of clients) {
        client[kTLSSession] = session
      }
    }

    for (const client of clients) {
      client.on('drain', onDrain)
      client.on('tlsSession', onTLSSession)
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
module.exports[Symbol.for('pool-symbols')] = { kClients, kQueue }
