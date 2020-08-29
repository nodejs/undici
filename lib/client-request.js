'use strict'

const { Readable } = require('stream')
const {
  InvalidArgumentError,
  RequestAbortedError
} = require('./core/errors')
const util = require('./core/util')
const { AsyncResource } = require('async_hooks')

const kAbort = Symbol('abort')

class RequestResponse extends Readable {
  constructor (resume, abort) {
    super({ autoDestroy: true, read: resume })
    this[kAbort] = abort
  }

  _destroy (err, callback) {
    if (!err && !this._readableState.endEmitted) {
      err = new RequestAbortedError()
    }

    if (err) {
      this[kAbort]()
    }

    callback(err)
  }
}

class RequestHandler extends AsyncResource {
  constructor (opts, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (opts.method === 'CONNECT') {
      throw new InvalidArgumentError('invalid method')
    }

    super('UNDICI_REQUEST')

    this.opaque = opts.opaque || null
    this.callback = callback
    this.res = null
    this.abort = null
    this.body = null

    if (util.isStream(opts.body)) {
      // TODO: Cleanup listeners?
      this.body = opts.body
      this.body.on('error', (err) => {
        // TODO: Ignore error if body has ended?
        this.onError(err)
      })
    }
  }

  onConnect (abort) {
    if (!this.callback) {
      abort()
    } else {
      this.abort = abort
    }
  }

  onHeaders (statusCode, headers, resume) {
    const { callback, opaque, abort } = this

    if (statusCode < 200) {
      return
    }

    const body = new RequestResponse(resume, abort)

    this.callback = null
    this.res = body

    this.runInAsyncScope(callback, null, null, {
      statusCode,
      headers: util.parseHeaders(headers),
      opaque,
      body
    })
  }

  onData (chunk) {
    const { res } = this
    return res.push(chunk)
  }

  onComplete (trailers) {
    const { res } = this
    res.push(null)
  }

  onError (err) {
    const { res, callback, body, opaque } = this

    if (callback) {
      this.callback = null
      process.nextTick((self, callback, err, opaque) => {
        self.runInAsyncScope(callback, null, err, { opaque })
      }, this, callback, err, opaque)
    }

    if (res) {
      this.res = null
      util.destroy(res, err)
    }

    if (body) {
      this.body = body
      util.destroy(body, err)
    }
  }
}

function request (opts, callback) {
  if (callback === undefined) {
    return new Promise((resolve, reject) => {
      request.call(this, opts, (err, data) => {
        return err ? reject(err) : resolve(data)
      })
    })
  }

  if (typeof callback !== 'function') {
    throw new InvalidArgumentError('invalid callback')
  }

  try {
    this.dispatch(opts, new RequestHandler(opts, callback))
  } catch (err) {
    process.nextTick(callback, err, null)
  }
}

module.exports = request
