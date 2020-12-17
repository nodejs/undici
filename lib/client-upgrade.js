'use strict'

const { InvalidArgumentError, RequestAbortedError } = require('./core/errors')
const { AsyncResource } = require('async_hooks')
const util = require('./core/util')
const { addSignal, removeSignal } = require('./abort-signal')

class UpgradeHandler extends AsyncResource {
  constructor (opts, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    const { signal, opaque } = opts

    if (signal && typeof signal.on !== 'function' && typeof signal.addEventListener !== 'function') {
      throw new InvalidArgumentError('signal must be an EventEmitter or EventTarget')
    }

    super('UNDICI_UPGRADE')

    this.opaque = opaque || null
    this.callback = callback
    this.abort = null

    addSignal(this, signal)
  }

  onConnect (abort) {
    if (!this.callback) {
      throw new RequestAbortedError()
    }

    this.abort = abort
  }

  onUpgrade (statusCode, headers, socket) {
    const { callback, opaque } = this

    removeSignal(this)

    this.callback = null
    this.runInAsyncScope(callback, null, null, {
      headers: util.parseHeaders(headers),
      socket,
      opaque
    })
  }

  onError (err) {
    const { callback, opaque } = this

    removeSignal(this)

    if (callback) {
      this.callback = null
      process.nextTick((self, callback, err, opaque) => {
        self.runInAsyncScope(callback, null, err, { opaque })
      }, this, callback, err, opaque)
    }
  }
}

function upgrade (opts, callback) {
  if (callback === undefined) {
    return new Promise((resolve, reject) => {
      upgrade.call(this, opts, (err, data) => {
        return err ? reject(err) : resolve(data)
      })
    })
  }

  if (typeof callback !== 'function') {
    throw new InvalidArgumentError('invalid callback')
  }

  try {
    const upgradeHandler = new UpgradeHandler(opts, callback)
    const {
      path,
      method,
      headers,
      servername,
      signal,
      protocol
    } = opts
    this.dispatch({
      path,
      method: method || 'GET',
      headers,
      servername,
      signal,
      upgrade: protocol || 'Websocket'
    }, upgradeHandler)
  } catch (err) {
    process.nextTick(callback, err, { opaque: opts && opts.opaque })
  }
}

module.exports = upgrade
