'use strict'

const { AsyncResource } = require('async_hooks')
const {
  InvalidArgumentError,
  RequestAbortedError,
  RequestTimeoutError
} = require('./errors')
const EE = require('events')
const assert = require('assert')
const net = require('net')

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

    if (
      body != null &&
      !(body instanceof Uint8Array) &&
      typeof body !== 'string' &&
      typeof body.on !== 'function'
    ) {
      throw new InvalidArgumentError('body must be a string, a Buffer or a Readable stream')
    }

    this.timeout = null

    this.signal = null

    this.method = method

    this.streaming = body && typeof body.on === 'function'

    this.body = typeof body === 'string'
      ? Buffer.from(body)
      : body

    const hostHeader = headers && (headers.host || headers.Host)

    this.servername = servername || hostHeader || hostname
    if (net.isIP(this.servername) || this.servername.startsWith('[')) {
      this.servername = null
    }

    this.chunked = !headers || headers['content-length'] === undefined

    this.callback = callback

    this.opaque = opaque

    this.idempotent = idempotent == null
      ? method === 'HEAD' || method === 'GET'
      : idempotent

    if (this.streaming) {
      this.body.on('error', (err) => {
        this.invoke(err, null)
      })
    }

    {
      // TODO (perf): Build directy into buffer instead of
      // using an intermediate string.

      let header = `${method} ${path} HTTP/1.1\r\n`

      if (headers) {
        const headerNames = Object.keys(headers)
        for (let i = 0; i < headerNames.length; i++) {
          const name = headerNames[i]
          header += name + ': ' + headers[name] + '\r\n'
        }
      }

      if (!hostHeader) {
        header += `host: ${hostname}\r\n`
      }

      header += 'connection: keep-alive\r\n'

      if (this.body && this.chunked && !this.streaming) {
        header += `content-length: ${Buffer.byteLength(this.body)}\r\n`
      }

      this.header = Buffer.from(header, 'ascii')
    }

    if (signal) {
      /* istanbul ignore else: can't happen but kept in case of refactoring */
      if (!this.signal) {
        this.signal = new EE()
      }

      const onAbort = () => {
        this.signal.emit('error', new RequestAbortedError())
      }

      if ('addEventListener' in signal) {
        signal.addEventListener('abort', onAbort)
      } else {
        signal.once('abort', onAbort)
      }
    }

    if (requestTimeout) {
      if (!this.signal) {
        this.signal = new EE()
      }

      const onTimeout = () => {
        this.signal.emit('error', new RequestTimeoutError())
      }

      this.timeout = setTimeout(onTimeout, requestTimeout)
    }

    if (this.signal) {
      this.signal.on('error', (err) => {
        assert(err)
        this.invoke(err, null)
      })
    }
  }

  wrap (that, cb) {
    return this.runInAsyncScope.bind(this, cb, that)
  }

  invoke (err, statusCode, headers, resume) {
    const { callback, signal, opaque } = this

    if (!callback) {
      return
    }

    if (
      this.body &&
      typeof this.body.destroy === 'function' &&
      !this.body.destroyed
    ) {
      this.body.destroy(err)
    }

    clearTimeout(this.timeout)
    this.timeout = null
    this.body = null
    this.servername = null
    this.callback = null
    this.opaque = null
    this.headers = null

    if (err) {
      this.runInAsyncScope(callback, this, err)
    } else {
      const body = this.runInAsyncScope(callback, this, null, {
        statusCode,
        headers: parseHeaders(headers),
        opaque,
        resume
      })

      if (body && signal) {
        signal.once('error', body)
      }

      return body
    }
  }
}

function parseHeaders (headers) {
  const obj = {}
  for (var i = 0; i < headers.length; i += 2) {
    var key = headers[i].toLowerCase()
    var val = obj[key]
    if (!val) {
      obj[key] = headers[i + 1]
    } else {
      if (!Array.isArray(val)) {
        val = [val]
        obj[key] = val
      }
      val.push(headers[i + 1])
    }
  }
  return obj
}

module.exports = Request
