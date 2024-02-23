'use strict'

const assert = require('node:assert')
const { AsyncResource } = require('node:async_hooks')
const { InvalidArgumentError, RequestAbortedError, SocketError } = require('../core/errors')
const util = require('../core/util')
const RedirectHandler = require('../handler/RedirectHandler')
const { addSignal, removeSignal } = require('./abort-signal')

class UpgradeHandler extends AsyncResource {
  constructor (opts, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (typeof callback !== 'function') {
      throw new InvalidArgumentError('invalid callback')
    }

    const { signal, opaque, responseHeaders } = opts

    if (signal && typeof signal.on !== 'function' && typeof signal.addEventListener !== 'function') {
      throw new InvalidArgumentError('signal must be an EventEmitter or EventTarget')
    }

    super('UNDICI_UPGRADE')

    this.responseHeaders = responseHeaders || null
    this.opaque = opaque || null
    this.callback = callback
    this.abort = null
    this.context = null

    addSignal(this, signal)
  }

  onConnect (abort, context) {
    if (!this.callback) {
      throw new RequestAbortedError()
    }

    this.abort = abort
    this.context = null
  }

  onHeaders () {
    throw new SocketError('bad upgrade', null)
  }

  onUpgrade (statusCode, rawHeaders, socket) {
    const { callback, opaque, context } = this

    assert.strictEqual(statusCode, 101)

    removeSignal(this)

    this.callback = null
    const headers = this.responseHeaders === 'raw' ? util.parseRawHeaders(rawHeaders) : util.parseHeaders(rawHeaders)
    this.runInAsyncScope(callback, null, null, {
      headers,
      socket,
      opaque,
      context
    })
  }

  onError (err) {
    const { callback, opaque } = this

    removeSignal(this)

    if (callback) {
      this.callback = null
      queueMicrotask(() => {
        this.runInAsyncScope(callback, null, err, { opaque })
      })
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

  try {
    const upgradeHandler = new UpgradeHandler(opts, callback)
    const upgradeOpts = {
      ...opts,
      method: opts.method || 'GET',
      upgrade: opts.protocol || 'Websocket'
    }

    if (opts?.maxRedirections != null && (!Number.isInteger(opts?.maxRedirections) || opts?.maxRedirections < 0)) {
      throw new InvalidArgumentError('maxRedirections must be a positive number')
    }

    if (opts?.maxRedirections > 0) {
      RedirectHandler.buildDispatch(this, opts.maxRedirections)(upgradeOpts, upgradeHandler)
      return
    }

    this.dispatch(upgradeOpts, upgradeHandler)
  } catch (err) {
    if (typeof callback !== 'function') {
      throw err
    }
    const opaque = opts?.opaque
    queueMicrotask(() => callback(err, { opaque }))
  }
}

module.exports = upgrade
