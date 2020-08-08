'use strict'

const { Readable } = require('stream')
const {
  InvalidArgumentError,
  RequestAbortedError
} = require('./errors')
const util = require('./util')
const { AsyncResource } = require('async_hooks')

class RequestResponse extends Readable {
  constructor (resume) {
    super({ autoDestroy: true, read: resume })
  }

  _destroy (err, callback) {
    if (!err && !this._readableState.endEmitted) {
      err = new RequestAbortedError()
    }

    callback(err)
  }
}

class RequestRequest extends AsyncResource {
  constructor (client, opts, callback) {
    super('UNDICI_REQUEST')

    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
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
    this.callback = callback
    this.res = null
  }

  _onHeaders (statusCode, headers, resume) {
    const { callback, opaque } = this

    if (statusCode < 200) {
      return
    }

    const body = new RequestResponse(resume)

    this.callback = null
    this.res = body

    this.runInAsyncScope(callback, null, null, { statusCode, headers, opaque, body })
  }

  _onData (chunk) {
    const { res } = this

    if (res.push(chunk)) {
      return true
    } else if (!res._readableState.destroyed) {
      return false
    } else {
      return null
    }
  }

  _onComplete (trailers) {
    const { res } = this

    if (res._readableState.destroyed) {
      return
    }

    res.push(null)
  }

  _onError (err) {
    const { res, callback } = this

    if (callback) {
      this.callback = null
      this.runInAsyncScope(callback, null, err, null)
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
    client.dispatch(opts, new RequestRequest(client, opts, callback))
  } catch (err) {
    process.nextTick(callback, err, null)
  }
}
