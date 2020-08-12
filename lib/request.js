'use strict'

const {
  InvalidArgumentError,
  RequestAbortedError,
  RequestTimeoutError,
  NotSupportedError
} = require('./errors')
const assert = require('assert')
const net = require('net')
const util = require('./util')
const { kRequestTimeout, kUrl } = require('./symbols')

const kAbort = Symbol('abort')
const kTimeout = Symbol('timeout')
const kResume = Symbol('resume')
const kSignal = Symbol('signal')
const kHandler = Symbol('handler')

class Request {
  constructor ({
    path,
    method,
    body,
    headers,
    idempotent,
    upgrade,
    servername,
    signal,
    requestTimeout
  }, {
    [kRequestTimeout]: defaultRequestTimeout,
    [kUrl]: { hostname: defaultHostname }
  }, handler) {
    if (typeof path !== 'string' || path[0] !== '/') {
      throw new InvalidArgumentError('path must be a valid path')
    }

    if (typeof method !== 'string') {
      throw new InvalidArgumentError('method must be a string')
    }

    if (upgrade && typeof upgrade !== 'string') {
      throw new InvalidArgumentError('upgrade must be a string')
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

    this[kHandler] = handler

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

    this.upgrade = !!upgrade

    this.idempotent = idempotent == null
      ? method === 'HEAD' || method === 'GET'
      : idempotent

    this.contentLength = null

    {
      let header = `${method} ${path} HTTP/1.1\r\n`

      if (upgrade) {
        header += `connection: upgrade\r\nupgrade: ${upgrade}\r\n`
      } else {
        header += 'connection: keep-alive\r\n'
      }

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
            this.contentLength === null &&
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
          } else if (
            key.length === 10 &&
            key.toLowerCase() === 'connection'
          ) {
            throw new InvalidArgumentError('invalid connection header')
          } else if (
            key.length === 10 &&
            key.toLowerCase() === 'keep-alive'
          ) {
            throw new InvalidArgumentError('invalid keep-alive header')
          } else if (
            key.length === 7 &&
            key.toLowerCase() === 'upgrade'
          ) {
            throw new InvalidArgumentError('invalid upgrade header')
          } else if (
            key.length === 6 &&
            key.toLowerCase() === 'expect'
          ) {
            throw new NotSupportedError('expect header not supported')
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

    this[kResume] = null
  }

  onUpgrade (statusCode, headers, socket) {
    assert(this.upgrade || this.method === 'CONNECT')

    if (this.aborted) {
      util.destroy(socket, new RequestAbortedError())
      return
    }

    reset.call(this)

    this[kHandler].onUpgrade(statusCode, headers, socket)
  }

  onHeaders (statusCode, headers, resume) {
    assert(!this.upgrade && this.method !== 'CONNECT')

    if (this.aborted) {
      return
    }

    this[kResume] = resume

    const {
      [kTimeout]: timeout
    } = this

    if (timeout) {
      this[kTimeout] = null
      clearTimeout(timeout)
    }

    this[kHandler].onHeaders(statusCode, headers, resume)
  }

  onBody (chunk, offset, length) {
    assert(!this.upgrade && this.method !== 'CONNECT')

    if (this.aborted) {
      return
    }

    return this[kHandler].onData(chunk.slice(offset, offset + length))
  }

  onComplete (trailers) {
    assert(!this.upgrade && this.method !== 'CONNECT')

    if (this.aborted) {
      return
    }

    reset.call(this)

    return this[kHandler].onComplete(trailers)
  }

  onError (err) {
    if (this.aborted) {
      return
    }
    this.aborted = true

    reset.call(this, err)

    const { [kResume]: resume } = this

    // TODO: resume is probably only needed
    // when aborted through signal or body?
    if (resume) {
      this[kResume] = null
      resume()
    }

    process.nextTick((handler, err) => {
      handler.onError(err)
    }, this[kHandler], err)
  }
}

function reset (err) {
  const {
    body,
    [kTimeout]: timeout,
    [kSignal]: signal
  } = this

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
}

module.exports = Request
