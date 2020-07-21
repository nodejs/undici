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
const assert = require('assert')

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
    const { callback, factory, opaque, timeout } = this

    if (statusCode < 200) {
      // TODO: Informational response.
      return
    }

    if (!factory) {
      return
    }
    this.factory = null

    if (timeout) {
      this.timeout = null
      clearTimeout(timeout)
    }

    let res
    try {
      res = factory({
        statusCode,
        headers,
        opaque
      })
    } catch (err) {
      this.onError(err)
      return
    }

    if (this.aborted) {
      // Aborted inside factory.
      return
    }

    assert(this.callback)

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
      const { callback, body, res } = this

      resume()

      if (err || (res && !res.readable)) {
        this.res = null
        util.destroy(res, err)
      }

      if (body) {
        this.body = null
        util.destroy(body, err)
      }

      if (callback) {
        this.callback = null
        callback(err, null)
      }
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
    if (this.aborted) {
      return
    }
    this.aborted = true

    const { body, res, timeout, callback } = this

    this.factory = null

    if (callback) {
      this.callback = null
      process.nextTick(callback, err, null)
    }

    if (body) {
      this.body = null
      util.destroy(body, err)
    }

    if (res) {
      this.res = null
      util.destroy(res, err)
    }

    if (timeout) {
      this.timeout = null
      clearTimeout(timeout)
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

    if (typeof callback !== 'function') {
      throw new InvalidArgumentError('invalid callback')
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
