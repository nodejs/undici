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
const kResume = Symbol('resume')

class RequestResponse extends Readable {
  constructor (request, resume) {
    super({ autoDestroy: true })

    this[kResume] = resume
    this[kRequest] = request
  }

  _read () {
    this[kResume]()
  }

  _destroy (err, callback) {
    if (!err && !this._readableState.endEmitted) {
      err = new RequestAbortedError()
    }

    if (err) {
      this[kRequest].onError(err)
    }

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

    this.callback = callback
    this.res = null
    this.onInfo = opts.onInfo
    this.onTrailers = opts.onTrailers
  }

  _onInfo (statusCode, headers) {
    if (this.onInfo) {
      try {
        this.onInfo({ statusCode, headers })
      } catch (err) {
        this.onError(err)
      }
    }
  }

  _onHeaders (statusCode, headers, resume) {
    const { callback, opaque } = this
    const body = new RequestResponse(this, resume)

    this.callback = null
    this.res = body

    callback(null, { statusCode, headers, opaque, body })
  }

  _onBody (chunk) {
    return this.res.push(chunk)
  }

  _onComplete (trailers) {
    const { res, opaque } = this

    res.push(null)

    if (trailers && this.onTrailers) {
      try {
        this.onTrailers({ trailers, opaque })
      } catch (err) {
        this.onError(err)
      }
    }
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
