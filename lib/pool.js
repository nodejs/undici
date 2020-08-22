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
const { RequestHandler } = require('./client-request')
const { StreamHandler } = require('./client-stream')
const { ConnectHandler } = require('./client-connect')
const { UpgradeHandler } = require('./client-upgrade')

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

  stream (opts, factory, callback) {
    if (callback === undefined) {
      return new Promise((resolve, reject) => {
        this.stream(opts, factory, (err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    if (typeof callback !== 'function') {
      throw new InvalidArgumentError('invalid callback')
    }

    try {
      this.dispatch(opts, new StreamHandler(opts, factory, callback))
    } catch (err) {
      process.nextTick(callback, err, null)
    }
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

    if (typeof callback !== 'function') {
      throw new InvalidArgumentError('invalid callback')
    }

    try {
      this.dispatch(opts, new RequestHandler(opts, callback))
    } catch (err) {
      process.nextTick(callback, err, null)
    }
  }

  upgrade (opts, callback) {
    if (callback === undefined) {
      return new Promise((resolve, reject) => {
        this.upgrade(opts, (err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    if (typeof callback !== 'function') {
      throw new InvalidArgumentError('invalid callback')
    }

    try {
      const upgradeHandler = new UpgradeHandler(opts, callback)
      const {
        path,
        method,
        headers,
        servername,
        signal,
        requestTimeout,
        protocol
      } = opts
      this.dispatch({
        path,
        method: method || 'GET',
        headers,
        servername,
        signal,
        requestTimeout,
        upgrade: protocol || 'Websocket'
      }, upgradeHandler)
    } catch (err) {
      process.nextTick(callback, err, null)
    }
  }

  connect (opts, callback) {
    if (callback === undefined) {
      return new Promise((resolve, reject) => {
        this.connect(opts, (err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    if (typeof callback !== 'function') {
      throw new InvalidArgumentError('invalid callback')
    }

    try {
      const connectHandler = new ConnectHandler(opts, callback)
      const {
        path,
        headers,
        servername,
        signal,
        requestTimeout
      } = opts
      this.dispatch({
        path,
        method: 'CONNECT',
        headers,
        servername,
        signal,
        requestTimeout
      }, connectHandler)
    } catch (err) {
      process.nextTick(callback, err, null)
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
