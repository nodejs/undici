'use strict'

const Request = require('./request')
const {
  InvalidArgumentError, NotSupportedError
} = require('./errors')
const { kEnqueue } = require('./symbols')
const assert = require('assert')

class ConnectRequest extends Request {
  constructor (client, opts, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (opts.method && opts.method !== 'CONNECT') {
      throw new InvalidArgumentError('invalid method')
    }

    if (opts.body) {
      // TODO: Allow body?
      throw new NotSupportedError('body not supported')
    }

    super({
      ...opts,
      method: 'CONNECT'
    }, client)

    this.callback = callback
  }

  _onUpgrade (statusCode, headers, socket) {
    const { callback } = this

    assert(callback)
    this.callback = null
    callback(null, {
      statusCode,
      headers,
      socket
    })
  }

  _onHeaders (statusCode, headers, resume) {
    assert(false)
  }

  _onBody (chunk, offset, length) {
    assert(false)
  }

  _onComplete (trailers) {
    assert(false)
  }

  _onError (err) {
    const { callback } = this

    if (callback) {
      this.callback = null
      process.nextTick(callback, err, null)
    }
  }
}

module.exports = function connect (client, opts, callback) {
  if (callback === undefined) {
    return new Promise((resolve, reject) => {
      connect(client, opts, (err, data) => {
        return err ? reject(err) : resolve(data)
      })
    })
  }

  if (typeof callback !== 'function') {
    throw new InvalidArgumentError('invalid callback')
  }

  try {
    client[kEnqueue](new ConnectRequest(client, opts, callback))
  } catch (err) {
    process.nextTick(callback, err, null)
  }
}
