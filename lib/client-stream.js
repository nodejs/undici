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

    this.factory = factory
    this.callback = callback
    this.res = null
    this.trailers = null
    this.onInfo = opts.onInfo
    this.onTrailers = opts.onTrailers
  }

  _onInfo (statusCode, headers) {
    const { opaque } = this

    if (this.onInfo) {
      try {
        this.onInfo({ statusCode, headers, opaque })
      } catch (err) {
        this.onError(err)
      }
    }
  }

  _onHeaders (statusCode, headers, resume) {
    const { factory, opaque } = this

    this.factory = null

    let res
    try {
      res = factory({ statusCode, headers, opaque })
    } catch (err) {
      this.onError(err)
      return
    }

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
      this.onError(new InvalidReturnValueError('expected Writable'))
      return
    }

    res.on('drain', resume)
    // TODO: Avoid finished. It registers an unecessary amount of listeners.
    finished(res, { readable: false }, (err) => {
      if (err) {
        this.onError(err)
        return
      }

      const { callback, res, opaque, trailers } = this

      this.res = null
      if (!res.readable) {
        util.destroy(res)
      }

      this.callback = null
      callback(null, { opaque, trailers })
    })

    if (typeof res.destroy === 'function') {
      res.destroy = this.runInAsyncScope.bind(this, res.destroy, res)
    }

    this.res = res
  }

  _onBody (chunk) {
    const { res } = this

    return res.write(chunk)
  }

  _onComplete (trailers) {
    const { res, opaque } = this

    res.end()

    this.trailers = trailers || {}

    if (trailers && this.onTrailers) {
      try {
        this.onTrailers({ trailers, opaque })
      } catch (err) {
        this.onError(err)
      }
    }
  }

  _onError (err) {
    const { res, callback } = this

    this.factory = null

    if (callback) {
      this.callback = null
      process.nextTick(callback, err, null)
    }

    if (res) {
      this.res = null
      util.destroy(res, err)
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
