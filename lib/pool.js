'use strict'

const Client = require('./client')

const kClients = Symbol('client')

class Pool {
  constructor (url, opts = {}) {
    let {
      connections,
      maxAbortedPayload,
      socketTimeout,
      requestTimeout,
      pipelining,
      tls
    } = opts
    connections = connections || 10
    pipelining = pipelining || 1
    this[kClients] = Array.from({
      length: connections
    }, () => new Client(url, {
      maxAbortedPayload,
      socketTimeout,
      requestTimeout,
      pipelining,
      tls
    }))
  }

  stream (opts, factory, cb) {
    // needed because we need the return value from client.stream
    if (cb === undefined) {
      return new Promise((resolve, reject) => {
        this.stream(opts, factory, (err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    getNext(this).stream(opts, factory, cb)
  }

  pipeline (opts, handler) {
    return getNext(this).pipeline(opts, handler)
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

  if (next) {
    return next
  }

  return pool[kClients][Math.floor(Math.random() * pool[kClients].length)]
}

module.exports = Pool
