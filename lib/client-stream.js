'use strict'

const { finished } = require('stream')
const {
  InvalidArgumentError,
  InvalidReturnValueError
} = require('./errors')
const util = require('./util')
const { AsyncResource } = require('async_hooks')

class StreamRequest extends AsyncResource {
  constructor (client, opts, factory, callback) {
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

    if (opts.onInfo && typeof opts.onInfo !== 'function') {
      throw new InvalidArgumentError('invalid opts.onInfo')
    }

    if (opts.onTrailers && typeof opts.onTrailers !== 'function') {
      throw new InvalidArgumentError('invalid opts.onTrailers')
    }

    this.opaque = opts.opaque || null
    this.factory = factory
    this.callback = callback
    this.res = null
    this.trailers = null
  }

  _onHeaders (statusCode, headers, resume) {
    const { factory, opaque } = this

    if (statusCode < 200) {
      return
    }

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

    res.on('drain', resume)
    // TODO: Avoid finished. It registers an unecessary amount of listeners.
    finished(res, { readable: false }, (err) => {
      const { callback, res, opaque, trailers } = this

      if (err || !res.readable) {
        util.destroy(res, res)
      }

      this.callback = null
      this.runInAsyncScope(callback, null, err, err ? null : { opaque, trailers })
    })

    this.res = res
  }

  _onData (chunk) {
    const { res } = this

    if (res.write(chunk)) {
      return true
    } else if (!util.isDestroyed(res)) {
      return false
    } else {
      return null
    }
  }

  _onComplete (trailers) {
    const { res } = this

    if (util.isDestroyed(res)) {
      return
    }

    this.trailers = trailers || {}
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
      this.runInAsyncScope(callback, null, err, null)
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
    client.dispatch(opts, new StreamRequest(client, opts, factory, callback))
  } catch (err) {
    process.nextTick(callback, err, null)
  }
}
