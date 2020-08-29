'use strict'

const {
  InvalidArgumentError,
  RequestAbortedError
} = require('./core/errors')
const { AsyncResource } = require('async_hooks')
const util = require('./core/util')

class ConnectHandler extends AsyncResource {
  constructor (opts, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    const { signal, opaque } = opts

    if (signal && typeof signal.on !== 'function' && typeof signal.addEventListener !== 'function') {
      throw new InvalidArgumentError('signal must be an EventEmitter or EventTarget')
    }

    super('UNDICI_CONNECT')

    this.opaque = opaque || null
    this.callback = callback
    this.abort = null

    if (signal) {
      this.signal = signal
      this.listener = () => {
        if (this.abort) {
          this.abort()
        } else {
          this.onError(new RequestAbortedError())
        }
      }
      util.addListener(this.signal, this.listener)
    }
  }

  onConnect (abort) {
    if (!this.callback) {
      abort()
    } else {
      this.abort = abort
    }
  }

  onUpgrade (statusCode, headers, socket) {
    const { callback, opaque, signal, listener } = this

    if (signal) {
      this.signal = null
      this.listener = null
      util.removeListener(signal, listener)
    }

    this.callback = null
    this.runInAsyncScope(callback, null, null, {
      statusCode,
      headers: util.parseHeaders(headers),
      socket,
      opaque
    })
  }

  onError (err) {
    const { callback, opaque, signal, listener } = this

    if (signal) {
      this.signal = null
      this.listener = null
      util.removeListener(signal, listener)
    }

    if (callback) {
      this.callback = null
      process.nextTick((self, callback, err, opaque) => {
        self.runInAsyncScope(callback, null, err, { opaque })
      }, this, callback, err, opaque)
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
