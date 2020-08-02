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
  constructor (request) {
    super({ autoDestroy: true })
    this[kRequest] = request
  }

  _read () {
    this[kRequest][kResume]()
    this[kRequest][kResume] = util.nop
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

    super(opts, client)

    this[kResume] = util.nop
    this.callback = callback
    this.res = null
  }

  _onHeaders (statusCode, headers) {
    const { callback, opaque } = this
    const body = new RequestResponse(this)

    this.callback = null
    this.res = body

    callback(null, { statusCode, headers, opaque, body })
  }

  _onBody (chunk, callback) {
    if (this.res.push(chunk)) {
      callback()
    } else {
      this[kResume] = callback
    }
  }

  _onComplete () {
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
