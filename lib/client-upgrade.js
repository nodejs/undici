'use strict'

const {
  InvalidArgumentError
} = require('./errors')

class UpgradeHandler {
  constructor (opts, callback) {
    this.opaque = opts.opaque || null
    this.callback = callback
  }

  onUpgrade (statusCode, headers, socket) {
    const { callback, opaque } = this

    this.callback = null
    callback(null, {
      headers,
      socket,
      opaque
    })
  }

  onError (err) {
    const { callback, opaque } = this

    this.callback = null
    callback(err, { opaque })
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
    }, new UpgradeHandler(opts, callback))
  } catch (err) {
    process.nextTick(callback, err, null)
  }
}
