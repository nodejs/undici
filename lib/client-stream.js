'use strict'

const { finished } = require('stream')
const { AsyncResource } = require('async_hooks')
const {
  InvalidArgumentError,
  InvalidReturnValueError
} = require('./errors')
const util = require('./util')

class StreamHandler extends AsyncResource {
  constructor (opts, factory, callback) {
    super('UNDICI_STREAM')

    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (typeof factory !== 'function') {
      throw new InvalidArgumentError('invalid factory')
    }

    if (opts.method === 'CONNECT') {
      throw new InvalidArgumentError('invalid method')
    }

    this.opaque = opts.opaque
    this.resume = null
    this.factory = factory
    this.callback = callback
    this.res = null
    this.trailers = null
  }

  _onConnect (resume) {
    this.resume = resume
  }

  _onHeaders (statusCode, headers) {
    const { factory, opaque } = this

    this.factory = null
    const res = this.runInAsyncScope(factory, null, { statusCode, headers, opaque })

    const { callback } = this

    if (!callback) {
      // Aborted inside factory.
      return
    }

    if (
      !res ||
      typeof res.write !== 'function' ||
      typeof res.end !== 'function' ||
      typeof res.on !== 'function'
    ) {
      throw new InvalidReturnValueError('expected Writable')
    }

    res.on('drain', this.resume)
    // TODO: Avoid finished. It registers an unecessary amount of listeners.
    finished(res, { readable: false }, (err) => {
      const { callback, res, opaque, trailers } = this

      this.res = null
      if (err || !res.readable) {
        util.destroy(res, res)
      }

      this.callback = null
      callback(err, err ? null : { opaque, trailers })
    })

    if (typeof res.destroy === 'function') {
      res.destroy = this.runInAsyncScope.bind(this, res.destroy, res)
    }

    this.res = res
  }

  _onData (chunk) {
    const { res } = this

    return res ? this.runInAsyncScope(res.write, res, chunk) : null
  }

  _onComplete (trailers) {
    const { res, opaque } = this

    if (!res) {
      return
    }

    this.trailers = trailers || {}

    if (trailers && this.onTrailers) {
      // TODO: Async Scope
      this.onTrailers({ trailers, opaque })
    }

    this.runInAsyncScope(res.end, res)
  }

  _onError (err) {
    const { res, callback } = this

    this.factory = null

    if (res) {
      this.res = null
      util.destroy(res, err)
    } else if (callback) {
      this.callback = null
      // TODO: Async Scope
      process.nextTick(callback, err, null)
    }
  }
}

module.exports = function stream (client, opts, factory, callback) {
  if (callback === undefined) {
    return new Promise((resolve, reject) => {
      stream(client, opts, factory, (err, data) => {
        return err ? reject(err) : resolve(data)
      })
    })
  }

  if (typeof callback !== 'function') {
    throw new InvalidArgumentError('invalid callback')
  }

  try {
    client.dispatch(opts, new StreamHandler(opts, factory, callback))
  } catch (err) {
    process.nextTick(callback, err, null)
  }
}
