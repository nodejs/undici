'use strict'

const { AsyncResource } = require('async_hooks')
const {
  InvalidArgumentError,
  RequestAbortedError
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
    signal
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

    this.hostname = headers && (headers.host || headers.Host)
    this.servername = servername || this.hostname || null
    if (net.isIP(this.servername) || /^\[/.test(this.servername)) {
      this.servername = null
    }

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
  }
}

module.exports = Request
