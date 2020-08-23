'use strict'

const { finished } = require('stream')
const {
  InvalidArgumentError,
  InvalidReturnValueError
} = require('./core/errors')
const util = require('./core/util')
const BaseHandler = require('./client-base')

class StreamHandler extends BaseHandler {
  constructor (opts, factory, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (typeof factory !== 'function') {
      throw new InvalidArgumentError('invalid factory')
    }

    if (opts.method === 'CONNECT') {
      throw new InvalidArgumentError('invalid method')
    }

    super('UNDICI_STREAM', opts)

    this.opaque = opts.opaque || null
    this.factory = factory
    this.callback = callback
    this.res = null
    this.abort = null
    this.trailers = null
  }

  onConnect (abort) {
    super.onConnect(abort)

    this.abort = abort
  }

  onHeaders (statusCode, headers, resume) {
    super.onHeaders(statusCode, headers, resume)

    const { factory, opaque } = this

    if (statusCode < 200) {
      return
    }

    this.factory = null
    const res = this.runInAsyncScope(factory, null, {
      statusCode,
      headers: util.parseHeaders(headers),
      opaque
    })

    if (
      !res ||
      typeof res.write !== 'function' ||
      typeof res.end !== 'function' ||
      typeof res.on !== 'function'
    ) {
      throw new InvalidReturnValueError('expected Writable')
    }

    res.on('drain', resume)
    // TODO: Avoid finished. It registers an unecessary amount of listeners.
    finished(res, { readable: false }, (err) => {
      const { callback, res, opaque, trailers, abort } = this

      this.res = null
      if (err || !res.readable) {
        util.destroy(res, err)
      }

      if (err) {
        abort()
      }

      this.callback = null
      this.runInAsyncScope(callback, null, err || null, { opaque, trailers })
    })

    this.res = res
  }

  onData (chunk) {
    const { res } = this
    return res.write(chunk)
  }

  onComplete (trailers) {
    super.onComplete(trailers)

    const { res } = this
    this.trailers = trailers ? util.parseHeaders(trailers) : {}
    res.end()
  }

  onError (err) {
    super.onError(err)

    const { res, callback, opaque } = this

    this.factory = null

    if (res) {
      this.res = null
      util.destroy(res, err)
    } else if (callback) {
      this.callback = null
      this.runInAsyncScope(callback, null, err, { opaque })
    }
  }
}

function stream (opts, factory, callback) {
  if (callback === undefined) {
    return new Promise((resolve, reject) => {
      stream.call(this, opts, factory, (err, data) => {
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

module.exports = stream
