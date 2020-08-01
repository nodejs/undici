'use strict'

const Request = require('./request')
const {
  InvalidArgumentError
} = require('./errors')
const { kEnqueue } = require('./symbols')
const assert = require('assert')

class UpgradeRequest extends Request {
  constructor (client, opts, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (opts.method === 'CONNECT') {
      throw new InvalidArgumentError('invalid method')
    }

    if (opts.body) {
      throw new InvalidArgumentError('invalid body')
    }

    super({
      ...opts,
      upgrade: opts.protocol || 'Websocket',
      method: opts.method || 'GET'
    }, client)

    this.callback = callback
    this.res = null
  }

  _onUpgrade (statusCode, headers, socket) {
    const { callback } = this

    assert(callback)
    this.callback = null
    callback(null, {
      headers,
      socket
    })
  }

  _onError (err) {
    const { callback } = this

    if (callback) {
      this.callback = null
      process.nextTick(callback, err, null)
    }
  }
}

module.exports = function upgrade (client, opts, callback) {
  if (callback === undefined) {
    return new Promise((resolve, reject) => {
      upgrade(client, opts, (err, data) => {
        return err ? reject(err) : resolve(data)
      })
    })
  }

  if (typeof callback !== 'function') {
    throw new InvalidArgumentError('invalid callback')
  }

  try {
    client[kEnqueue](new UpgradeRequest(client, opts, callback))
  } catch (err) {
    process.nextTick(callback, err, null)
  }
}
