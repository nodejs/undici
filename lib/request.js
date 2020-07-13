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
  }, hostname, callback) {
    super('UNDICI_REQ')

    assert(typeof hostname === 'string')
    assert(typeof callback === 'function')

    if (typeof path !== 'string' || path[0] !== '/') {
      throw new InvalidArgumentError('path must be a valid path')
    }

    if (typeof method !== 'string') {
      throw new InvalidArgumentError('method must be a string')
    }

    if (requestTimeout != null && (!Number.isInteger(requestTimeout) || requestTimeout < 0)) {
      throw new InvalidArgumentError('requestTimeout must be a positive integer or zero')
    }

    if (signal && typeof signal.on !== 'function' && typeof signal.addEventListener !== 'function') {
      throw new InvalidArgumentError('signal must implement .on(name, callback)')
    }

    this.method = method

    if (body == null) {
      this.body = null
    } else if (typeof body.on === 'function') {
      this.body = body.on('error', (err) => {
        // TODO: Ignore error if body has ended?
        this.onError(err)
      })
      assert(this.body === body)
    } else if (body instanceof Uint8Array) {
      this.body = body.length ? body : null
    } else if (typeof body === 'string') {
      this.body = body.length ? Buffer.from(body) : null
    } else {
      throw new InvalidArgumentError('body must be a string, a Buffer or a Readable stream')
    }
    assert(!this.body || util.isStream(this.body) || util.bodyLength(this.body) > 0)

    const hostHeader = headers && (headers.host || headers.Host)

    this.servername = servername || hostHeader || hostname
    if (net.isIP(this.servername) || this.servername.startsWith('[')) {
      this.servername = null
    }

    this.callback = callback

    this.finished = false

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
            this.contentLength == null &&
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

      if (!hostHeader) {
        header += `host: ${hostname}\r\n`
      }

      this.header = Buffer.from(header, 'ascii')
    }

    if (signal) {
      const onAbort = () => {
        this.onError(new RequestAbortedError())
      }

      if ('addEventListener' in signal) {
        signal.addEventListener('abort', onAbort)
      } else {
        signal.once('abort', onAbort)
      }
    }

    this.timeout = requestTimeout
      ? setTimeout((self) => {
        self.onError(new RequestTimeoutError())
      }, requestTimeout, this)
      : null
  }

  wrap (that, cb) {
    return this.runInAsyncScope.bind(this, cb, that)
  }

  onHeaders (statusCode, headers, resume) {
    if (statusCode < 200) {
      // TODO: Informational response.
      return
    }

    if (this.finished) {
      return
    }
    this.finished = true

    clearTimeout(this.timeout)
    this.timeout = null

    this.res = this.runInAsyncScope(this.callback, this, null, {
      statusCode,
      headers,
      opaque: this.opaque,
      resume
    })
    assert(!this.res || typeof this.res === 'function')
  }

  onBody (chunk, offset, length) {
    if (this.res) {
      return this.res(null, chunk.slice(offset, offset + length))
    }
  }

  onComplete (trailers) {
    // TODO: Trailers?

    if (this.res) {
      const res = this.res
      this.res = null
      res(null, null)
    }
  }

  onError (err) {
    if (util.isStream(this.body)) {
      // TODO: If this.body.destroy doesn't exists or doesn't emit 'error' or
      // 'close', it can halt execution in client.
      const body = this.body
      this.body = null
      util.destroy(body, err)
    }

    if (this.res) {
      const res = this.res
      this.res = null
      res(err, null)
    }

    if (this.finished) {
      return
    }
    this.finished = true

    clearTimeout(this.timeout)
    this.timeout = null

    this.runInAsyncScope(this.callback, this, err, null)
  }
}

module.exports = Request
