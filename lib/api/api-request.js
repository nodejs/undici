'use strict'

const assert = require('node:assert')
const { AsyncResource } = require('node:async_hooks')
const { Readable } = require('./readable')
const { InvalidArgumentError, RequestAbortedError } = require('../core/errors')
const util = require('../core/util')

function noop () {}

class RequestHandler extends AsyncResource {
  constructor (opts, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    const { signal, method, opaque, body, onInfo, responseHeaders, highWaterMark } = opts

    let error = null

    if (typeof callback !== 'function') {
      error = new InvalidArgumentError('invalid callback')
    } else if (highWaterMark && (typeof highWaterMark !== 'number' || highWaterMark < 0)) {
      error = new InvalidArgumentError('invalid highWaterMark')
    } else if (signal && typeof signal.on !== 'function' && typeof signal.addEventListener !== 'function') {
      error = new InvalidArgumentError('signal must be an EventEmitter or EventTarget')
    } else if (method === 'CONNECT') {
      error = new InvalidArgumentError('invalid method')
    } else if (onInfo && typeof onInfo !== 'function') {
      error = new InvalidArgumentError('invalid onInfo callback')
    }

    if (error) {
      if (util.isStream(body)) {
        util.destroy(body.on('error', noop), error)
      }
      throw error
    }

    super('UNDICI_REQUEST')

    this.method = method
    this.responseHeaders = responseHeaders || null
    this.opaque = opaque || null
    this.callback = callback
    this.res = null
    this.abort = null
    this.body = body
    this.trailers = {}
    this.context = null
    this.onInfo = onInfo || null
    this.highWaterMark = highWaterMark
    this.reason = null
    this.removeAbortListener = null

    if (signal?.aborted) {
      this.reason = signal.reason ?? new RequestAbortedError()
    } else if (signal) {
      this.removeAbortListener = util.addAbortListener(signal, () => {
        this.reason = signal.reason ?? new RequestAbortedError()
        if (this.res) {
          util.destroy(this.res.on('error', noop), this.reason)
        } else if (this.abort) {
          this.abort(this.reason)
        }
      })
    }
  }

  onConnect (abort, context) {
    if (this.reason) {
      abort(this.reason)
      return
    }

    assert(this.callback)

    this.abort = abort
    this.context = context
  }

  onHeaders (statusCode, rawHeaders, resume, statusMessage) {
    const { callback, opaque, abort, context, responseHeaders, highWaterMark } = this

    const headers = responseHeaders === 'raw' ? util.parseRawHeaders(rawHeaders) : util.parseHeaders(rawHeaders)

    if (statusCode < 200) {
      if (this.onInfo) {
        this.onInfo({ statusCode, headers })
      }
      return
    }

    const parsedHeaders = responseHeaders === 'raw' ? util.parseHeaders(rawHeaders) : headers
    const contentType = parsedHeaders['content-type']
    const contentLength = parsedHeaders['content-length']
    const res = new Readable({
      resume,
      abort,
      contentType,
      contentLength: this.method !== 'HEAD' && contentLength
        ? Number(contentLength)
        : null,
      highWaterMark
    })

    if (this.removeAbortListener) {
      res.on('close', this.removeAbortListener)
      this.removeAbortListener = null
    }

    this.callback = null
    this.res = res
    if (callback !== null) {
      try {
        this.runInAsyncScope(callback, null, null, {
          statusCode,
          headers,
          trailers: this.trailers,
          opaque,
          body: res,
          context
        })
      } catch (err) {
        // If the callback throws synchronously, we need to handle it
        // Remove reference to res to allow res being garbage collected
        this.res = null

        // Destroy the response stream
        util.destroy(res.on('error', noop), err)

        // Use queueMicrotask to re-throw the error so it reaches uncaughtException
        queueMicrotask(() => {
          throw err
        })
      }
    }
  }

  onData (chunk) {
    return this.res.push(chunk)
  }

  onComplete (trailers) {
    util.parseHeaders(trailers, this.trailers)
    this.res.push(null)
  }

  onError (err) {
    const { res, callback, body, opaque } = this

    if (callback) {
      // TODO: Does this need queueMicrotask?
      this.callback = null
      queueMicrotask(() => {
        this.runInAsyncScope(callback, null, err, { opaque })
      })
    }

    if (res) {
      this.res = null
      // Ensure all queued handlers are invoked before destroying res.
      queueMicrotask(() => {
        util.destroy(res.on('error', noop), err)
      })
    }

    if (body) {
      this.body = null

      if (util.isStream(body)) {
        body.on('error', noop)
        util.destroy(body, err)
      }
    }

    if (this.removeAbortListener) {
      this.removeAbortListener()
      this.removeAbortListener = null
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

  try {
    const handler = new RequestHandler(opts, callback)

    this.dispatch(opts, handler)
  } catch (err) {
    if (typeof callback !== 'function') {
      throw err
    }
    const opaque = opts?.opaque
    queueMicrotask(() => callback(err, { opaque }))
  }
}

module.exports = request
module.exports.RequestHandler = RequestHandler
