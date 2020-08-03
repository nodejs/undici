'use strict'

const { Readable } = require('stream')
const { AsyncResource } = require('async_hooks')
const {
  InvalidArgumentError,
  RequestAbortedError
} = require('./errors')
const util = require('./util')

const kRequest = Symbol('request')

class ResponseBody extends Readable {
  constructor (request) {
    super({ autoDestroy: true })

    this[kRequest] = request
  }

  _read () {
    this[kRequest].controller.resume()
  }

  _destroy (err, callback) {
    if (!err && !this._readableState.endEmitted) {
      err = new RequestAbortedError()
    }

    if (err) {
      this[kRequest].controller.error(err)
    }

    this[kRequest].runInAsyncScope(callback, null, err, null)
  }
}

class RequestHandler extends AsyncResource {
  constructor (opts, callback) {
    super('UNDICI_REQUEST')

    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (opts.method === 'CONNECT') {
      throw new InvalidArgumentError('invalid method')
    }

    this.opaque = opts.opaque
    this.controller = null
    this.callback = callback
    this.res = null
  }

  onConnect (controller) {
    this.controller = controller
  }

  onHeaders (statusCode, headers) {
    if (statusCode < 200) {
      return
    }

    const { callback, opaque } = this
    const body = new ResponseBody(this)

    this.callback = null
    this.res = body

    this.runInAsyncScope(callback, null, null, { statusCode, headers, opaque, body })
  }

  onData (chunk) {
    const { res, controller } = this
    if (!this.runInAsyncScope(res.push, res, chunk)) {
      controller.pause()
    }
  }

  onComplete () {
    const { res } = this
    this.runInAsyncScope(res.push, res, null)
  }

  onError (err) {
    const { res, callback } = this

    if (callback) {
      this.callback = null
      // TODO: Async Scope
      process.nextTick(callback, err, null)
    }

    if (res) {
      this.res = null
      util.destroy(res, err)
    }
  }
}

module.exports = function request (client, opts, callback) {
  if (callback === undefined) {
    return new Promise((resolve, reject) => {
      request(client, opts, (err, data) => {
        return err ? reject(err) : resolve(data)
      })
    })
  }

  if (typeof callback !== 'function') {
    throw new InvalidArgumentError('invalid callback')
  }

  try {
    client.dispatch(opts, new RequestHandler(opts, callback))
  } catch (err) {
    process.nextTick(callback, err, null)
  }
}
