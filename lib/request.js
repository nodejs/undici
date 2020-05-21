'use strict'

const { AsyncResource } = require('async_hooks')
const {
  InvalidArgumentError,
  RequestAbortedError,
  RequestTimeoutError
} = require('./errors')
const EE = require('events')
const assert = require('assert')

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
  constructor (opts, callback) {
    super('UNDICI_REQ')

    if (!opts) {
      throw new InvalidArgumentError('no options passed')
    }

    const { path, method, body, headers, idempotent, opaque, signal, requestTimeout } = opts

    if (typeof path !== 'string' || path[0] !== '/') {
      throw new InvalidArgumentError('path must be a valid path')
    }

    if (typeof method !== 'string' || !methods[method]) {
      throw new InvalidArgumentError('method must be a valid method')
    }

    if (requestTimeout != null && (!Number.isInteger(requestTimeout) || requestTimeout < 1)) {
      throw new InvalidArgumentError('requestTimeout must be a positive integer')
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

    this.path = path

    this.body = body

    this.host = headers && (headers.host || headers.Host)

    this.chunked = !headers || headers['content-length'] === undefined

    this.callback = this.wrap(this, callback)

    this.opaque = opaque

    this.idempotent = idempotent == null
      ? this.method === 'HEAD' || this.method === 'GET'
      : idempotent

    this.rawHeaders = ''

    if (headers) {
      const headerNames = Object.keys(headers)
      for (let i = 0; i < headerNames.length; i++) {
        const name = headerNames[i]
        this.rawHeaders += name + ': ' + headers[name] + '\r\n'
      }
    }

    if (signal) {
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

        const { callback } = this

        if (!callback) {
          return
        }

        clearTimeout(this.timeout)
        this.timeout = null
        this.callback = null
        this.opaque = null

        callback(err, null)
      })
    }
  }

  wrap (that, cb) {
    return this.runInAsyncScope.bind(this, cb, that)
  }
}

module.exports = Request
