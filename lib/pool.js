'use strict'

const Client = require('./client')
const {
  InvalidArgumentError
} = require('./errors')
const { PassThrough } = require('stream')
const {
  kClients,
  kQueue,
  kPendingIdx
} = require('./symbols')
const { PipelineHandler } = require('./client-pipeline')

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

  stream (opts, factory, callback) {
    if (callback === undefined) {
      return new Promise((resolve, reject) => {
        this.stream(opts, factory, (err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    enqueue(this, Client.prototype.stream, opts, factory, callback)
  }

  pipeline (opts, handler) {
    try {
      const pipeline = new PipelineHandler(opts, handler)

      const {
        path,
        method,
        headers,
        idempotent,
        servername,
        signal,
        requestTimeout
      } = opts

      this.dispatch({
        path,
        method,
        body: pipeline.req,
        headers,
        idempotent,
        servername,
        signal,
        requestTimeout
      }, pipeline)

      return pipeline.ret
    } catch (err) {
      return new PassThrough().destroy(err)
    }
  }

  request (opts, callback) {
    if (callback === undefined) {
      return new Promise((resolve, reject) => {
        this.request(opts, (err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    enqueue(this, Client.prototype.request, opts, callback)
  }

  upgrade (opts, callback) {
    if (callback === undefined) {
      return new Promise((resolve, reject) => {
        this.upgrade(opts, (err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    enqueue(this, Client.prototype.upgrade, opts, callback)
  }

  connect (opts, callback) {
    if (callback === undefined) {
      return new Promise((resolve, reject) => {
        this.connect(opts, (err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    enqueue(this, Client.prototype.connect, opts, callback)
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
