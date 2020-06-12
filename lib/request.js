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

const methods = [
  'ACL',
  'BIND',
  'CHECKOUT',
  'CONNECT',
  'COPY',
  'DELETE',
  'GET',
  'HEAD',
  'LINK',
  'LOCK',
  'M-SEARCH',
  'MERGE',
  'MKACTIVITY',
  'MKCALENDAR',
  'MKCOL',
  'MOVE',
  'NOTIFY',
  'OPTIONS',
  'PATCH',
  'POST',
  'PROPFIND',
  'PROPPATCH',
  'PURGE',
  'PUT',
  'REBIND',
  'REPORT',
  'SEARCH',
  'SOURCE',
  'SUBSCRIBE',
  'TRACE',
  'UNBIND',
  'UNLINK',
  'UNLOCK',
  'UNSUBSCRIBE'
].reduce((acc, m) => {
  acc[m] = true
  return acc
}, {})

function isValidBody (body) {
  return body == null ||
    body instanceof Uint8Array ||
    typeof body === 'string' ||
    typeof body.pipe === 'function'
}

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

    if (typeof method !== 'string' || !methods[method]) {
      throw new InvalidArgumentError('method must be a valid method')
    }

    if (requestTimeout != null && (!Number.isInteger(requestTimeout) || requestTimeout < 0)) {
      throw new InvalidArgumentError('requestTimeout must be a positive integer or zero')
    }

    if (signal && typeof signal.on !== 'function' && typeof signal.addEventListener !== 'function') {
      throw new InvalidArgumentError('signal must implement .on(name, callback)')
    }

    if (!isValidBody(body)) {
      throw new InvalidArgumentError('body must be a string, a Buffer or a Readable stream')
    }

    this.timeout = null

    this.signal = null

    this.method = method

    this.streaming = body && typeof body.pipe === 'function'

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

  invoke (err, val) {
    const { callback } = this

    if (!callback) {
      return
    }

    if (
      this.streaming &&
      this.body &&
      !this.body.destroyed &&
      typeof this.body.destroy === 'function'
    ) {
      this.body.destroy(err)
    }

    clearTimeout(this.timeout)
    this.timeout = null
    this.body = null
    this.callback = null
    this.opaque = null
    this.headers = null

    return this.runInAsyncScope(callback, this, err, val)
  }
}

module.exports = Request
