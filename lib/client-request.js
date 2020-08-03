'use strict'

const { Readable } = require('stream')
const { AsyncResource } = require('async_hooks')
const {
  InvalidArgumentError,
  RequestAbortedError
} = require('./errors')
const util = require('./util')

const kRequest = Symbol('request')

class ResponseBody extends Readable {
  constructor (request) {
    super({ autoDestroy: true })

    this[kRequest] = request
  }

  _read () {
    this[kRequest].resume()
  }

  _destroy (err, callback) {
    if (!err && !this._readableState.endEmitted) {
      err = new RequestAbortedError()
    }

    this[kRequest].res = null
    this[kRequest].runInAsyncScope(callback, null, err, null)
  }
}

class RequestHandler extends AsyncResource {
  constructor (opts, callback) {
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

    this.opaque = opts.opaque
    this.resume = null
    this.callback = callback
    this.res = null
    this.onInfo = opts.onInfo
    this.onTrailers = opts.onTrailers
  }

  _onConnect (resume) {
    this.resume = resume
  }

  _onInfo (statusCode, headers) {
    if (this.onInfo) {
      // TODO: Async Scope
      this.onInfo({ statusCode, headers })
    }
  }

  _onHeaders (statusCode, headers) {
    const { callback, opaque } = this
    const body = new ResponseBody(this)

    this.callback = null
    this.res = body

    this.runInAsyncScope(callback, null, null, { statusCode, headers, opaque, body })
  }

  _onData (chunk) {
    const { res } = this

    return res ? this.runInAsyncScope(res.push, res, chunk) : null
  }

  _onComplete (trailers) {
    const { res, opaque } = this

    if (!res) {
      return
    }

    if (trailers && this.onTrailers) {
      // TODO: Async Scope
      this.onTrailers({ trailers, opaque })
    }

    this.runInAsyncScope(res.push, res, null)
  }

  _onError (err) {
    const { res, callback } = this

    if (callback) {
      this.callback = null
      // TODO: Async Scope
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
    client.dispatch(opts, new RequestHandler(opts, callback))
  } catch (err) {
    process.nextTick(callback, err, null)
  }
}
