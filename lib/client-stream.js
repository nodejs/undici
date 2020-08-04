'use strict'

const { finished } = require('stream')
const Request = require('./request')
const {
  InvalidArgumentError,
  InvalidReturnValueError
} = require('./errors')
const util = require('./util')
const { kEnqueue } = require('./symbols')

class StreamRequest extends Request {
  constructor (client, opts, factory, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (typeof factory !== 'function') {
      throw new InvalidArgumentError('invalid factory')
    }

    if (opts.method === 'CONNECT') {
      throw new InvalidArgumentError('invalid method')
    }

    if (opts.onInfo && typeof opts.onInfo !== 'function') {
      throw new InvalidArgumentError('invalid opts.onInfo')
    }

    if (opts.onTrailers && typeof opts.onTrailers !== 'function') {
      throw new InvalidArgumentError('invalid opts.onTrailers')
    }

    super(opts, client)

    this.opaque = opts.opaque || null
    this.resume = null
    this.factory = factory
    this.callback = callback
    this.res = null
    this.trailers = null
    this.onInfo = opts.onInfo
    this.onTrailers = opts.onTrailers
  }

  _onConnect (resume) {
    this.resume = resume
  }

  _onHeaders (statusCode, headers) {
    const { factory, opaque } = this

    if (statusCode < 200) {
      if (this.onInfo) {
        this.onInfo({ statusCode, headers, opaque })
      }
      return
    }

    this.factory = null
    const res = factory({ statusCode, headers, opaque })

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

    return res ? res.write(chunk) : null
  }

  _onComplete (trailers) {
    const { res, opaque } = this

    if (!res) {
      return
    }

    this.trailers = trailers || {}

    if (trailers && this.onTrailers) {
      this.onTrailers({ trailers, opaque })
    }

    res.end()
  }

  _onError (err) {
    const { res, callback } = this

    this.factory = null

    if (res) {
      this.res = null
      util.destroy(res, err)
    } else if (callback) {
      this.callback = null
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
    client[kEnqueue](new StreamRequest(client, opts, factory, callback))
  } catch (err) {
    process.nextTick(callback, err, null)
  }
}
