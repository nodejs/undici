'use strict'

const { Readable } = require('stream')
const Request = require('./request')
const {
  InvalidArgumentError,
  RequestAbortedError,
  NotSupportedError
} = require('./errors')
const util = require('./util')
const { kEnqueue } = require('./symbols')
class RequestRequest extends Request {
  constructor (client, opts, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (opts.method === 'CONNECT') {
      throw new NotSupportedError('CONNECT method is not supported')
    }

    super(opts, client)

    this.callback = callback
    this.res = null
  }

  _onHeaders (statusCode, headers, resume) {
    const { callback, opaque } = this

    if (!callback) {
      return
    }
    this.callback = null

    const request = this
    this.res = new Readable({
      autoDestroy: true,
      read: resume,
      destroy (err, callback) {
        this._read() // resume

        if (!err && !this._readableState.endEmitted) {
          err = new RequestAbortedError()
        }

        request.runInAsyncScope(callback, null, err, null)
      }
    }).on('error', (err) => {
      this.onError(err)
    })

    callback(null, {
      statusCode,
      headers,
      opaque,
      body: this.res
    })
  }

  _onBody (chunk, offset, length) {
    return this.res.push(chunk.slice(offset, offset + length))
  }

  _onComplete (trailers) {
    this.res.push(null)
  }

  _onError (err) {
    const { res, callback } = this

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
    client[kEnqueue](new RequestRequest(client, opts, callback))
  } catch (err) {
    process.nextTick(callback, err, null)
  }
}
