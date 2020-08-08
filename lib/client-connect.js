'use strict'

const {
  InvalidArgumentError
} = require('./errors')

class ConnectRequest {
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
      statusCode,
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
    const {
      path,
      headers,
      servername,
      signal,
      requestTimeout
    } = opts
    client.dispatch({
      path,
      method: 'CONNECT',
      headers,
      servername,
      signal,
      requestTimeout
    }, new ConnectRequest(client, opts, callback))
  } catch (err) {
    process.nextTick(callback, err, null)
  }
}
