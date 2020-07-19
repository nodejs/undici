'use strict'

const { finished } = require('stream')
const Request = require('./request')
const {
  InvalidArgumentError,
  InvalidReturnValueError,
  ClientDestroyedError,
  ClientClosedError,
  RequestTimeoutError
} = require('./errors')
const util = require('./util')
const {
  kDestroyed,
  kRequestTimeout,
  kEnqueue,
  kClosed
} = require('./symbols')

class StreamRequest extends Request {
  constructor (client, opts, factory, callback) {
    super(opts)

    const requestTimeout = opts.requestTimeout == null && client[kRequestTimeout]
      ? client[kRequestTimeout]
      : opts.requestTimeout

    if (requestTimeout != null && (!Number.isInteger(requestTimeout) || requestTimeout < 0)) {
      throw new InvalidArgumentError('requestTimeout must be a positive integer or zero')
    }

    this.timeout = requestTimeout
      ? setTimeout((self) => {
        self.onError(new RequestTimeoutError())
      }, requestTimeout, this)
      : null

    this.aborted = false
    this.factory = factory
    this.callback = callback
    this.res = null
  }

  onHeaders (statusCode, headers, resume) {
    if (statusCode < 200) {
      // TODO: Informational response.
      return
    }

    if (!this.callback) {
      return
    }

    const { callback, factory, opaque } = this
    this.callback = null

    clearTimeout(this.timeout)

    let res
    try {
      res = factory({
        statusCode,
        headers,
        opaque
      })
    } catch (err) {
      callback(err, null)
      return
    }

    if (!res) {
      callback(null, null)
      return
    }

    if (
      typeof res.write !== 'function' ||
      typeof res.end !== 'function' ||
      typeof res.on !== 'function'
    ) {
      callback(new InvalidReturnValueError('expected Writable'), null)
      return
    }

    res.on('drain', resume)
    // TODO: Avoid finished. It registers an unecessary amount of listeners.
    finished(res, { readable: false }, (err) => {
      res.removeListener('drain', resume)
      resume()

      if (err || !res.readable) {
        util.destroy(res, err)
      }

      callback(err, null)
    })

    if (typeof res.destroy === 'function') {
      res.destroy = this.runInAsyncScope.bind(this, res.destroy, res)
    }

    this.res = res
  }

  onBody (chunk, offset, length) {
    if (this.aborted || !this.res || util.isDestroyed(this.res)) {
      return null
    }
    const ret = this.res.write(chunk.slice(offset, offset + length))
    return util.isDestroyed(this.res) ? null : ret
  }

  onComplete (trailers) {
    if (this.aborted || !this.res || util.isDestroyed(this.res)) {
      return
    }

    // TODO: Trailers?

    this.res.end()
  }

  onError (err) {
    if (this.aborted) {
      return
    }
    this.aborted = true

    util.destroy(this.body, err)
    util.destroy(this.res, err)

    clearTimeout(this.timeout)

    if (this.callback) {
      process.nextTick(this.callback, err, null)
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

    if (client[kDestroyed]) {
      throw new ClientDestroyedError()
    }

    if (client[kClosed]) {
      throw new ClientClosedError()
    }

    client[kEnqueue](new StreamRequest(client, opts, factory, callback))
  } catch (err) {
    process.nextTick(callback, err, null)
  }
}
