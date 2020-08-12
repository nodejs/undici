'use strict'

const {
  InvalidArgumentError
} = require('./errors')

class ConnectHandler {
  constructor (opts, callback) {
    this.opaque = opts.opaque || null
    this.callback = callback
  }

  onUpgrade (statusCode, headers, socket) {
    const { callback, opaque } = this

    this.callback = null
    callback(null, {
      statusCode,
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
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

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
    }, new ConnectHandler(opts, callback))
  } catch (err) {
    process.nextTick(callback, err, null)
  }
}
