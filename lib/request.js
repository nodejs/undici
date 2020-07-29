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
const { kRequestTimeout, kUrl } = require('./symbols')

const kAbort = Symbol('abort')
const kTimeout = Symbol('timeout')
const kResume = Symbol('resume')
const kSignal = Symbol('signal')

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
  }, {
    [kRequestTimeout]: defaultRequestTimeout,
    [kUrl]: { hostname: defaultHostname }
  }) {
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

    requestTimeout = requestTimeout == null && defaultRequestTimeout
      ? defaultRequestTimeout
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

    const hostHeader = headers && (headers.host || headers.Host)

    this.servername = servername || hostHeader || null
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

      if (!hostHeader) {
        header += `host: ${defaultHostname}\r\n`
      }

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
      this[kSignal] = signal
      this[kAbort] = () => {
        this.onError(new RequestAbortedError())
      }

      if ('addEventListener' in signal) {
        signal.addEventListener('abort', this[kAbort])
      } else {
        signal.addListener('abort', this[kAbort])
      }
    } else {
      this[kSignal] = null
      this[kAbort] = null
    }

    this[kTimeout] = requestTimeout
      ? setTimeout((self) => {
        self.onError(new RequestTimeoutError())
      }, requestTimeout, this)
      : null
  }

  onHeaders (statusCode, headers, resume) {
    if (this.aborted) {
      return
    }

    const {
      [kTimeout]: timeout
    } = this

    if (timeout) {
      this[kTimeout] = null
      clearTimeout(timeout)
    }

    this[kResume] = resume

    this.runInAsyncScope(this._onHeaders, this, statusCode, headers, resume)
  }

  onBody (chunk, offset, length) {
    if (this.aborted) {
      return null
    }

    return this.runInAsyncScope(this._onBody, this, chunk, offset, length)
  }

  onComplete (trailers) {
    if (this.aborted) {
      return
    }

    const {
      body,
      [kSignal]: signal
    } = this

    if (body) {
      this.body = null
      util.destroy(body)
    }

    if (signal) {
      this[kSignal] = null
      if ('removeEventListener' in signal) {
        signal.removeEventListener('abort', this[kAbort])
      } else {
        signal.removeListener('abort', this[kAbort])
      }
    }

    this.runInAsyncScope(this._onComplete, this, trailers)
  }

  onError (err) {
    if (this.aborted) {
      return
    }
    this.aborted = true

    const {
      body,
      [kTimeout]: timeout,
      [kSignal]: signal,
      [kResume]: resume
    } = this

    if (resume) {
      resume()
    }

    if (timeout) {
      this[kTimeout] = null
      clearTimeout(timeout)
    }

    if (body) {
      this.body = null
      util.destroy(body, err)
    }

    if (signal) {
      this[kSignal] = null
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
