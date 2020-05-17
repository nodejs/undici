'use strict'

const Client = require('./client')

const kClients = Symbol('client')

class Pool {
  constructor (url, opts = {}) {
    let {
      connections,
      pipelining,
      timeout,
      tls,
      https,
      maxAbortedPayload
    } = opts
    connections = connections || 10
    pipelining = pipelining || 1
    this[kClients] = Array.from({
      length: connections
    }, () => new Client(url, {
      pipelining,
      timeout,
      tls,
      https,
      maxAbortedPayload
    }))
  }

  stream (opts, factory, cb) {
    // needed because we need the return value from client.stream
    if (cb === undefined) {
      return new Promise((resolve, reject) => {
        this.request(opts, (err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    getNext(this).stream(opts, factory, cb)
  }

  request (opts, cb) {
    // needed because we need the return value from client.request
    if (cb === undefined) {
      return new Promise((resolve, reject) => {
        this.request(opts, (err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    getNext(this).request(opts, cb)
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
    const promise = Promise.all(this[kClients].map(c => c.destroy(err)))
    if (cb) {
      promise.then(() => cb(null, null), (err) => cb(err, null))
    } else {
      return promise
    }
  }
}

function getNext (pool) {
  let next
  for (const client of pool[kClients]) {
    if (client.full) {
      continue
    }

    if (!next) {
      next = client
    }

    if (client.connected) {
      return client
    }
  }

  return next || pool[kClients][Math.floor(Math.random() * pool[kClients].length)]
}

module.exports = Pool
