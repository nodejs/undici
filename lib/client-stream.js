'use strict'

const { finished } = require('stream')
const {
  InvalidArgumentError,
  InvalidReturnValueError
} = require('./errors')
const util = require('./util')
const { AsyncResource } = require('async_hooks')

class StreamHandler extends AsyncResource {
  constructor (opts, factory, callback) {
    super('UNDICI_STREAM')

    this.opaque = opts.opaque || null
    this.factory = factory
    this.callback = callback
    this.res = null
    this.trailers = null
  }

  onHeaders (statusCode, headers, resume) {
    const { factory, callback, opaque } = this

    if (statusCode < 200) {
      return
    }

    let res
    try {
      this.factory = null
      res = this.runInAsyncScope(factory, null, {
        statusCode,
        headers,
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
    } catch (err) {
      this.callback = null
      this.runInAsyncScope(callback, null, err, { opaque })
      return
    }

    res.on('drain', resume)
    // TODO: Avoid finished. It registers an unecessary amount of listeners.
    finished(res, { readable: false }, (err) => {
      const { callback, res, opaque, trailers } = this

      this.res = null
      if (err || !res.readable) {
        util.destroy(res, err)
      }

      this.callback = null
      this.runInAsyncScope(callback, null, err || null, { opaque, trailers })
    })

    this.res = res
  }

  onData (chunk) {
    const { res } = this

    if (util.isDestroyed(res)) {
      return
    }

    return res.write(chunk)
  }

  onComplete (trailers) {
    const { res } = this

    if (util.isDestroyed(res)) {
      return
    }

    this.trailers = trailers || {}

    res.end()
  }

  onError (err) {
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
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (typeof factory !== 'function') {
      throw new InvalidArgumentError('invalid factory')
    }

    if (opts.method === 'CONNECT') {
      throw new InvalidArgumentError('invalid method')
    }

    client.dispatch(opts, new StreamHandler(opts, factory, callback))
  } catch (err) {
    process.nextTick(callback, err, null)
  }
}
