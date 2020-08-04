'use strict'

const { Readable } = require('stream')
const Request = require('./request')
const {
  InvalidArgumentError,
  RequestAbortedError
} = require('./errors')
const util = require('./util')
const { kEnqueue } = require('./symbols')

const kRequest = Symbol('request')

class RequestResponse extends Readable {
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

class RequestRequest extends Request {
  constructor (client, opts, callback) {
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

    super(opts, client)

    this.opaque = opts.opaque || null
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
      this.onInfo({ statusCode, headers })
    }
  }

  _onHeaders (statusCode, headers) {
    const { callback, opaque } = this
    const body = new RequestResponse(this)

    this.callback = null
    this.res = body

    callback(null, { statusCode, headers, opaque, body })
  }

  _onData (chunk) {
    const { res } = this

    return res ? res.push(chunk) : null
  }

  _onComplete (trailers) {
    const { res, opaque } = this

    if (!res) {
      return
    }

    if (trailers && this.onTrailers) {
      this.onTrailers({ trailers, opaque })
    }

    res.push(null)
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
