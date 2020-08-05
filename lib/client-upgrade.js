'use strict'

const Request = require('./request')
const {
  InvalidArgumentError
} = require('./errors')
const { kEnqueue } = require('./symbols')

class UpgradeRequest extends Request {
  constructor (client, opts, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    const {
      path,
      method,
      headers,
      servername,
      signal,
      requestTimeout,
      protocol,
      opaque = null
    } = opts

    super({
      path,
      method: method || 'GET',
      headers,
      servername,
      signal,
      requestTimeout,
      upgrade: protocol || 'Websocket'
    }, client)

    this.opaque = opaque
    this.callback = callback
  }

  _onUpgrade (statusCode, headers, socket) {
    const { callback, opaque } = this

    this.callback = null
    callback(null, {
      headers,
      socket,
      opaque
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
