'use strict'

const { Readable } = require('stream')
const {
  InvalidArgumentError,
  RequestAbortedError
} = require('./errors')
const util = require('./util')
const { AsyncResource } = require('async_hooks')

class RequestResponse extends Readable {
  constructor (resume) {
    super({ autoDestroy: true, read: resume })
  }

  _destroy (err, callback) {
    this._read()

    if (!err && !this._readableState.endEmitted) {
      err = new RequestAbortedError()
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
  }

  onHeaders (statusCode, headers, resume) {
    const { callback, opaque } = this

    if (statusCode < 200) {
      return
    }

    const body = new RequestResponse(resume)

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

    if (res._readableState.destroyed) {
      return
    }

    return res.push(chunk)
  }

  onComplete (trailers) {
    const { res } = this

    if (res._readableState.destroyed) {
      return
    }

    res.push(null)
  }

  onError (err) {
    const { res, callback, opaque } = this

    if (callback) {
      this.callback = null
      this.runInAsyncScope(callback, null, err, { opaque })
    }

    if (res) {
      this.res = null
      util.destroy(res, err)
    }
  }
}

function request (client, opts, callback) {
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

module.exports = {
  request,
  RequestHandler
}
