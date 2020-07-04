'use strict'

const { AsyncResource } = require('async_hooks')
const {
  InvalidArgumentError,
  RequestAbortedError,
  RequestTimeoutError
} = require('./errors')
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

    this.method = method

    this.streaming = body && typeof body.on === 'function'

    this.body = typeof body === 'string'
      ? Buffer.from(body)
      : body

    this.read = 0

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
      const onAbort = () => {
        this.invoke(new RequestAbortedError(), null)
      }

      if ('addEventListener' in signal) {
        signal.addEventListener('abort', onAbort)
      } else {
        signal.once('abort', onAbort)
      }
    }

    if (requestTimeout) {
      this.timeout = setTimeout((self) => {
        self.invoke(new RequestTimeoutError(), null)
      }, requestTimeout, this)
    }
  }

  wrap (that, cb) {
    return this.runInAsyncScope.bind(this, cb, that)
  }

  push (chunk, offset, length) {
    this.read += length || 0
    if (!this.res) {
      return null
    } else if (!chunk) {
      this.res(null, null)
      this.res = null
      return null
    } else {
      return this.res(null, chunk.slice(offset, offset + length))
    }
  }

  invoke (err, statusCode, headers, resume) {
    if (err) {
      if (this.body) {
        // TODO: If this.body.destroy doesn't exists or doesn't emit 'error' or
        // 'close', it can halt execution in client.
        if (typeof this.body.destroy === 'function' && !this.body.destroyed) {
          this.body.destroy(err)
        }
        this.body = null
      }

      if (this.res) {
        this.res(err, null)
        this.res = null
      }
    }

    if (!this.callback) {
      return
    }

    const { callback } = this
    this.callback = null

    clearTimeout(this.timeout)
    this.timeout = null

    this.res = this.runInAsyncScope(callback, this, err, !err && {
      statusCode,
      headers: parseHeaders(headers),
      opaque: this.opaque,
      resume
    })
    assert(!this.res || typeof this.res === 'function')
    return this.res
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
