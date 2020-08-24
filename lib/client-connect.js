'use strict'

const {
  InvalidArgumentError
} = require('./core/errors')
const { AsyncResource } = require('async_hooks')
const util = require('./core/util')

class ConnectHandler extends AsyncResource {
  constructor (opts, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    super('UNDICI_CONNECT')

    this.opaque = opts.opaque || null
    this.callback = callback
  }

  onConnect (abort) {
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
      this.runInAsyncScope(callback, null, err, { opaque })
    }
  }
}

function connect (opts, callback) {
  if (callback === undefined) {
    return new Promise((resolve, reject) => {
      connect.call(this, opts, (err, data) => {
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
    this.dispatch({
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

module.exports = connect
