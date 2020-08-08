'use strict'

const { Readable } = require('stream')
const {
  InvalidArgumentError,
  RequestAbortedError
} = require('./errors')
const util = require('./util')
const { AsyncResource } = require('async_hooks')

const kRequest = Symbol('request')

class RequestResponse extends Readable {
  constructor (request, resume) {
    super({ autoDestroy: true, read: resume })

    this[kRequest] = request
  }

  _destroy (err, callback) {
    if (!err && !this._readableState.endEmitted) {
      err = new RequestAbortedError()
    }

    this[kRequest].runInAsyncScope(callback, null, err, null)
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
    this.onInfo = opts.onInfo
    this.onTrailers = opts.onTrailers
  }

  _onHeaders (statusCode, headers, resume) {
    const { callback, opaque } = this

    if (statusCode < 200) {
      if (this.onInfo) {
        this.runInAsyncScope(this.onInfo, null, { statusCode, headers, opaque })
      }
      return
    }

    const body = new RequestResponse(this, resume)

    this.callback = null
    this.res = body

    this.runInAsyncScope(callback, null, null, { statusCode, headers, opaque, body })
  }

  _onData (chunk) {
    const { res } = this

    if (this.runInAsyncScope(res.push, res, chunk)) {
      return true
    } else if (!res._readableState.destroyed) {
      return false
    } else {
      return null
    }
  }

  _onComplete (trailers) {
    const { res, opaque } = this

    if (res.destroyed) {
      return
    }

    if (trailers && this.onTrailers) {
      this.runInAsyncScope(this.onTrailers, null, { trailers, opaque })
    }

    this.runInAsyncScope(res.push, res, null)
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
