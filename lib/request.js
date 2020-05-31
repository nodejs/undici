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
  constructor ({
    path,
    method,
    body,
    headers,
    idempotent,
    opaque,
    signal,
    requestTimeout
  }, callback) {
    super('UNDICI_REQ')

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

    this.path = path

    this.body = body

    this.host = headers && Boolean(headers.host || headers.Host)

    this.chunked = !headers || headers['content-length'] === undefined

    this.callback = callback

    this.opaque = opaque

    this.idempotent = idempotent == null
      ? method === 'HEAD' || method === 'GET'
      : idempotent

    this.headers = ''

    if (headers) {
      const headerNames = Object.keys(headers)
      for (let i = 0; i < headerNames.length; i++) {
        const name = headerNames[i]
        this.headers += name + ': ' + headers[name] + '\r\n'
      }
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

    clearTimeout(this.timeout)
    this.timeout = null
    this.path = null
    this.body = null
    this.callback = null
    this.opaque = null
    this.headers = null

    return this.runInAsyncScope(callback, this, err, val)
  }
}

module.exports = Request
