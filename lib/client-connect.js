'use strict'

const {
  InvalidArgumentError
} = require('./errors')
const { AsyncResource } = require('async_hooks')
const util = require('./util')

class ConnectHandler extends AsyncResource {
  constructor (opts, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    super('UNDICI_CONNECT')

    this.opaque = opts.opaque || null
    this.callback = callback
  }

  onUpgrade (statusCode, headers, socket) {
    const { callback, opaque } = this

    this.callback = null
    this.runInAsyncScope(callback, null, null, {
      statusCode,
      headers: util.parseHeaders(headers),
      socket,
      opaque
    })
  }

  onError (err) {
    const { callback, opaque } = this

    if (callback) {
      this.callback = null
      callback(err, { opaque })
    }
  }
}

function connect (client, opts, callback) {
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
    const connectHandler = new ConnectHandler(opts, callback)
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
    }, connectHandler)
  } catch (err) {
    process.nextTick(callback, err, null)
  }
}

module.exports = {
  connect,
  ConnectHandler
}
