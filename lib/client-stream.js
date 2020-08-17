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
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (typeof factory !== 'function') {
      throw new InvalidArgumentError('invalid factory')
    }

    if (opts.method === 'CONNECT') {
      throw new InvalidArgumentError('invalid method')
    }

    super('UNDICI_STREAM')

    this.opaque = opts.opaque || null
    this.factory = factory
    this.callback = callback
    this.res = null
    this.trailers = null
  }

  onHeaders (statusCode, headers, resume) {
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

    this.trailers = util.parseHeaders(trailers)

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

function stream (client, opts, factory, callback) {
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

module.exports = {
  stream,
  StreamHandler
}
