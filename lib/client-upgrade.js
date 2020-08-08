'use strict'

const {
  InvalidArgumentError
} = require('./errors')

class UpgradeHandler {
  constructor (client, opts, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    this.opaque = opts.opaque || null
    this.callback = callback
  }

  _onUpgrade (statusCode, headers, socket) {
    const { callback, opaque } = this

    this.callback = null
    callback.call(opaque, null, {
      headers,
      socket
    })
  }

  _onError (err) {
    const { callback, opaque } = this

    if (callback) {
      this.callback = null
      callback.call(opaque, err, null)
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
    const {
      path,
      method,
      headers,
      servername,
      signal,
      requestTimeout,
      protocol
    } = opts
    client.dispatch({
      path,
      method: method || 'GET',
      headers,
      servername,
      signal,
      requestTimeout,
      upgrade: protocol || 'Websocket'
    }, new UpgradeHandler(client, opts, callback))
  } catch (err) {
    process.nextTick(callback, err, null)
  }
}
