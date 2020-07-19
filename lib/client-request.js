'use strict'

const { Readable } = require('stream')
const Request = require('./request')
const {
  InvalidArgumentError,
  RequestTimeoutError,
  RequestAbortedError
} = require('./errors')
const util = require('./util')
const { kRequestTimeout } = require('./symbols')

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

    this.aborted = false
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

    const { callback, opaque } = this
    this.callback = null

    clearTimeout(this.timeout)

    const request = this
    this.res = new Readable({
      autoDestroy: true,
      read: resume,
      destroy (err, callback) {
        resume()

        if (!err && !this._readableState.endEmitted) {
          err = new RequestAbortedError()
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
    if (this.aborted || !this.res || util.isDestroyed(this.res)) {
      return null
    }
    const ret = this.res.push(chunk.slice(offset, offset + length))
    return util.isDestroyed(this.res) ? null : ret
  }

  onComplete (trailers) {
    if (this.aborted || !this.res || util.isDestroyed(this.res)) {
      return
    }

    // TODO: Trailers?

    this.res.push(null)
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

module.exports = function (client, opts, callback) {
  return new RequestRequest(client, opts, callback)
}
