'use strict'

const Client = require('./client')
const {
  InvalidArgumentError
} = require('./errors')
const {
  kClients,
  kGetNext
} = require('./symbols')

class Pool {
  constructor (url, {
    connections,
    ...options
  } = {}) {
    if (connections != null && (!Number.isFinite(connections) || connections <= 0)) {
      throw new InvalidArgumentError('invalid connections')
    }

    this[kClients] = Array.from({
      length: connections || 10
    }, () => new Client(url, options))
  }

  /* istanbul ignore next: use by benchmark */
  [kGetNext] () {
    return getNext(this)
  }

  stream (opts, factory, cb) {
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
    if (cb === undefined) {
      return new Promise((resolve, reject) => {
        this.request(opts, (err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    getNext(this).request(opts, cb)
  }

  upgrade (opts, callback) {
    return getNext(this).upgrade(opts, callback)
  }

  connect (opts, callback) {
    return getNext(this).connect(opts, callback)
  }

  dispatch (opts, handler) {
    return getNext(this).dispatch(opts, handler)
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
    if (client.busy) {
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
