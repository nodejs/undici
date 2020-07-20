'use strict'

const { Readable } = require('stream')
const Request = require('./request')
const {
  InvalidArgumentError,
  RequestTimeoutError,
  RequestAbortedError,
  NotSupportedError,
  ClientClosedError,
  ClientDestroyedError
} = require('./errors')
const util = require('./util')
const {
  kRequestTimeout,
  kEnqueue,
  kClosed,
  kDestroyed
} = require('./symbols')

class RequestRequest extends Request {
  constructor (client, opts, callback) {
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

    this.callback = callback
    this.res = null
  }

  onHeaders (statusCode, headers, resume) {
    const { callback, opaque, timeout } = this

    if (statusCode < 200) {
      // TODO: Informational response.
      return
    }

    if (!callback) {
      return
    }
    this.callback = null

    if (timeout) {
      this.timeout = null
      clearTimeout(timeout)
    }

    const request = this
    this.res = new Readable({
      autoDestroy: true,
      read: resume,
      destroy (err, callback) {
        resume()

        if (!err && !this._readableState.endEmitted) {
          err = new RequestAbortedError()
        }

        const { body } = request
        if (body) {
          request.body = null
          util.destroy(body, err)
        }

        request.runInAsyncScope(
          callback,
          null,
          err,
          null
        )
      }
    })

    callback(null, {
      statusCode,
      headers,
      opaque,
      body: this.res
    })
  }

  onBody (chunk, offset, length) {
    if (!this.res || util.isDestroyed(this.res)) {
      return null
    }
    const ret = this.res.push(chunk.slice(offset, offset + length))
    return util.isDestroyed(this.res) ? null : ret
  }

  onComplete (trailers) {
    if (this.res) {
      this.res.push(null)
    }
  }

  onError (err) {
    if (this.aborted) {
      return
    }
    this.aborted = true

    const { body, res, timeout, callback } = this

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

module.exports = function request (client, opts, callback) {
  if (callback === undefined) {
    return new Promise((resolve, reject) => {
      request(client, opts, (err, data) => {
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

    if (opts.method === 'CONNECT') {
      throw new NotSupportedError('CONNECT method is not supported')
    }

    if (client[kDestroyed]) {
      throw new ClientDestroyedError()
    }

    if (client[kClosed]) {
      throw new ClientClosedError()
    }

    client[kEnqueue](new RequestRequest(client, opts, callback))
  } catch (err) {
    process.nextTick(callback, err, null)
  }
}
