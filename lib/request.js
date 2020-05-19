'use strict'

const { AsyncResource } = require('async_hooks')
const {
  InvalidArgumentError,
  RequestAbortedError,
  TimeoutError
} = require('./errors')
const EE = require('events')

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

    const { path, method, body, headers, idempotent, opaque, signal, timeout } = opts

    if (!(typeof path === 'string' && path[0] === '/')) {
      throw new InvalidArgumentError('path must be a valid path')
    }

    if (timeout != null && (!Number.isInteger(timeout) || timeout < 1)) {
      throw new InvalidArgumentError('timeout must be a positive integer')
    }

    if (!(typeof method === 'string' && methods[method])) {
      throw new InvalidArgumentError('method must be a valid method')
    }

    if (signal && typeof signal.on !== 'function') {
      throw new InvalidArgumentError('signal must implement .on(name, callback)')
    }

    if (!isValidBody(body)) {
      throw new InvalidArgumentError('body must be a string, a Buffer or a Readable stream')
    }

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

    if (signal) {
      if (!this.signal) {
        this.signal = new EE()
      }

      signal.on('abort', () => {
        this.signal.emit('error', new RequestAbortedError())
      })
    }

    if (timeout) {
      if (!this.signal) {
        this.signal = new EE()
      }

      this.timeout = setTimeout(() => {
        this.signal.emit('error', new TimeoutError())
      }, timeout)
    }

    if (this.signal) {
      this.signal.once('error', (err) => {
        const { callback } = this

        if (!callback) {
          return
        }

        clearTimeout(this.timeout)
        this.timeout = null
        this.callback = null
        this.opaque = null

        process.nextTick(callback, err, null)
      })
    }

    if (headers) {
      const headerNames = Object.keys(headers)
      for (let i = 0; i < headerNames.length; i++) {
        const name = headerNames[i]
        this.rawHeaders += name + ': ' + headers[name] + '\r\n'
      }
    }
  }

  wrap (that, cb) {
    return this.runInAsyncScope.bind(this, cb, that)
  }
}

module.exports = Request
