'use strict'

const { AsyncResource } = require('async_hooks')
const {
  InvalidArgumentError,
  RequestAbortedError,
  RequestTimeoutError
} = require('./errors')
const assert = require('assert')
const net = require('net')
const util = require('./util')
const { kRequestTimeout } = require('./symbols')

const kAbort = Symbol('abort')

class Request extends AsyncResource {
  constructor ({
    path,
    method,
    body,
    headers,
    idempotent,
    opaque,
    servername,
    signal,
    requestTimeout
  }, client) {
    super('UNDICI_REQ')

    if (typeof path !== 'string' || path[0] !== '/') {
      throw new InvalidArgumentError('path must be a valid path')
    }

    if (typeof method !== 'string') {
      throw new InvalidArgumentError('method must be a string')
    }

    if (signal && typeof signal.on !== 'function' && typeof signal.addEventListener !== 'function') {
      throw new InvalidArgumentError('signal must be an EventEmitter or EventTarget')
    }

    requestTimeout = requestTimeout == null && client[kRequestTimeout]
      ? client[kRequestTimeout]
      : requestTimeout

    if (requestTimeout != null && (!Number.isInteger(requestTimeout) || requestTimeout < 0)) {
      throw new InvalidArgumentError('requestTimeout must be a positive integer or zero')
    }

    this.method = method

    if (body == null) {
      this.body = null
    } else if (util.isStream(body)) {
      this.body = body
    } else if (body instanceof Uint8Array) {
      this.body = body.length ? body : null
    } else if (typeof body === 'string') {
      this.body = body.length ? Buffer.from(body) : null
    } else {
      throw new InvalidArgumentError('body must be a string, a Buffer or a Readable stream')
    }
    assert(!this.body || util.isStream(this.body) || util.bodyLength(this.body) > 0)

    this.hostname = headers && (headers.host || headers.Host)
    this.servername = servername || this.hostname || null
    if (net.isIP(this.servername) || /^\[/.test(this.servername)) {
      this.servername = null
    }

    this.aborted = false

    this.opaque = opaque

    this.idempotent = idempotent == null
      ? method === 'HEAD' || method === 'GET'
      : idempotent

    this.contentLength = undefined

    {
      // TODO (perf): Build directy into buffer instead of
      // using an intermediate string.

      let header = `${method} ${path} HTTP/1.1\r\nconnection: keep-alive\r\n`

      if (headers) {
        for (const [key, val] of Object.entries(headers)) {
          if (typeof val === 'object') {
            throw new InvalidArgumentError(`invalid ${key} header`)
          } else if (val === undefined) {
            continue
          }

          if (
            this.contentLength === undefined &&
            key.length === 14 &&
            key.toLowerCase() === 'content-length'
          ) {
            this.contentLength = parseInt(val)
            if (!Number.isFinite(this.contentLength)) {
              throw new InvalidArgumentError('invalid content-length header')
            }
          } else if (
            key.length === 17 &&
            key.toLowerCase() === 'transfer-encoding'
          ) {
            throw new InvalidArgumentError('invalid transfer-encoding header')
          } else {
            header += `${key}: ${val}\r\n`
          }
        }
      }

      this.header = Buffer.from(header, 'ascii')
    }

    if (util.isStream(this.body)) {
      // TODO: Cleanup listeners?
      this.body.on('error', (err) => {
        // TODO: Ignore error if body has ended?
        this.onError(err)
      })
    }

    if (signal) {
      this[kAbort] = () => {
        this.onError(new RequestAbortedError())
      }

      // TODO: Cleanup listeners when not onError?
      if ('addEventListener' in signal) {
        signal.addEventListener('abort', this[kAbort])
      } else {
        signal.once('abort', this[kAbort])
      }
    } else {
      this[kAbort] = null
    }

    this.signal = signal

    this.timeout = requestTimeout
      ? setTimeout((self) => {
        self.onError(new RequestTimeoutError())
      }, requestTimeout, this)
      : null
  }

  onHeaders (statusCode, headers, resume) {
    const { timeout } = this

    if (timeout) {
      this.timeout = null
      clearTimeout(timeout)
    }

    this.runInAsyncScope(this._onHeaders, this, statusCode, headers, resume)
  }

  onBody (chunk, offset, length) {
    return this.runInAsyncScope(this._onBody, this, chunk, offset, length)
  }

  onComplete (trailers) {
    this.runInAsyncScope(this._onComplete, this, trailers)
  }

  onError (err) {
    if (this.aborted) {
      return
    }
    this.aborted = true

    const { body, timeout, signal } = this

    if (body) {
      this.body = null
      util.destroy(body, err)
    }

    if (timeout) {
      this.timeout = null
      clearTimeout(timeout)
    }

    if (signal) {
      this.signal = null
      if ('removeEventListener' in signal) {
        signal.removeEventListener('abort', this[kAbort])
      } else {
        signal.removeListener('abort', this[kAbort])
      }
    }

    this.runInAsyncScope(this._onError, this, err)
  }
}

module.exports = Request
