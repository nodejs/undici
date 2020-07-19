'use strict'

const { PassThrough } = require('stream')
const {
  InvalidArgumentError,
  ClientClosedError,
  ClientDestroyedError
} = require('./errors')
const {
  kEnqueue,
  kDestroyed,
  kClosed
} = require('./symbols')
const ClientBase = require('./client-base')
const makeStream = require('./client-stream')
const makeRequest = require('./client-request')
const makePipeline = require('./client-pipeline')

class Client extends ClientBase {
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
      if (!opts || typeof opts !== 'object') {
        throw new InvalidArgumentError('invalid opts')
      }

      if (this[kDestroyed]) {
        throw new ClientDestroyedError()
      }

      if (this[kClosed]) {
        throw new ClientClosedError()
      }

      this[kEnqueue](makeRequest(this, opts, callback))
    } catch (err) {
      process.nextTick(callback, err, null)
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
      if (!opts || typeof opts !== 'object') {
        throw new InvalidArgumentError('invalid opts')
      }

      if (typeof factory !== 'function') {
        throw new InvalidArgumentError('invalid factory')
      }

      if (this[kDestroyed]) {
        throw new ClientDestroyedError()
      }

      if (this[kClosed]) {
        throw new ClientClosedError()
      }

      this[kEnqueue](makeStream(this, opts, factory, callback))
    } catch (err) {
      process.nextTick(callback, err, null)
    }
  }

  pipeline (opts, handler) {
    try {
      if (!opts || typeof opts !== 'object') {
        throw new InvalidArgumentError('invalid opts')
      }

      if (typeof handler !== 'function') {
        throw new InvalidArgumentError('invalid handler')
      }

      if (this[kDestroyed]) {
        throw new ClientDestroyedError()
      }

      if (this[kClosed]) {
        throw new ClientClosedError()
      }

      const request = makePipeline(this, opts, handler)

      this[kEnqueue](request)

      return request.ret
    } catch (err) {
      return new PassThrough().destroy(err)
    }
  }
}

module.exports = Client
