'use strict'

const Request = require('./request')
const {
  InvalidArgumentError
} = require('./errors')
const { kEnqueue } = require('./symbols')

class ConnectRequest extends Request {
  constructor (client, opts, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (opts.method) {
      throw new InvalidArgumentError('invalid method')
    }

    if (opts.body) {
      // https://tools.ietf.org/html/rfc7231#section-4.3.6
      // A payload within a CONNECT request message has no defined semantics;
      // sending a payload body on a CONNECT request might cause some existing
      // implementations to reject the request.
      throw new InvalidArgumentError('invalid body')
    }

    super({ ...opts, method: 'CONNECT' }, client)

    this.opaque = opts.opaque || null
    this.callback = callback
  }

  _onUpgrade (statusCode, headers, socket) {
    const { callback, opaque } = this

    this.callback = null
    callback(null, {
      statusCode,
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
