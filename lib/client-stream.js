'use strict'

const { finished } = require('stream')
const Request = require('./request')
const {
  InvalidArgumentError,
  InvalidReturnValueError,
  ClientDestroyedError,
  ClientClosedError,
  NotSupportedError,
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

    this.factory = factory
    this.callback = callback
    this.res = null
  }

  onHeaders (statusCode, headers, resume) {
    if (statusCode < 200) {
      // TODO: Informational response.
      return
    }

    if (!this.factory) {
      return
    }

    const { callback, factory, opaque, timeout } = this
    this.factory = null

    this.timeout = null
    clearTimeout(timeout)

    let res
    try {
      res = factory({
        statusCode,
        headers,
        opaque
      })
    } catch (err) {
      this.callback = null
      callback(err, null)
      return
    }

    if (!res) {
      this.callback = null
      callback(null, null)
      return
    }

    if (
      typeof res.write !== 'function' ||
      typeof res.end !== 'function' ||
      typeof res.on !== 'function'
    ) {
      this.callback = null
      callback(new InvalidReturnValueError('expected Writable'), null)
      return
    }

    res.on('drain', resume)
    // TODO: Avoid finished. It registers an unecessary amount of listeners.
    finished(res, { readable: false }, (err) => {
      if (!this.callback) {
        return
      }

      const { callback, body, res } = this
      this.callback = null

      resume()

      if (err || !res.readable) {
        this.res = null
        util.destroy(res, err)
      }

      this.body = null
      util.destroy(body, err)

      callback(err, null)
    })

    if (typeof res.destroy === 'function') {
      res.destroy = this.runInAsyncScope.bind(this, res.destroy, res)
    }

    this.res = res
  }

  onBody (chunk, offset, length) {
    return this.res
      ? this.res.write(chunk.slice(offset, offset + length))
      : null
  }

  onComplete (trailers) {
    if (this.res) {
      this.res.end()
    }
  }

  onError (err) {
    if (!this.callback) {
      return
    }

    const { body, res, timeout, callback } = this
    this.callback = null
    this.factory = null

    this.body = null
    util.destroy(body, err)

    this.res = null
    util.destroy(res, err)

    this.timeout = null
    clearTimeout(timeout)

    process.nextTick(callback, err, null)
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
      throw new NotSupportedError('CONNECT method is not supported')
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
