'use strict'

const {
  InvalidArgumentError,
  RequestAbortedError,
  RequestTimeoutError,
  NotSupportedError
} = require('./errors')
const net = require('net')
const util = require('./util')
const {
  kRequestTimeout,
  kUrl,
  kSocket,
  kResume,
  kKeepAlive
} = require('./symbols')
const assert = require('assert')

const kAbort = Symbol('abort')
const kTimeout = Symbol('timeout')
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
    signal,
    requestTimeout
  }, {
    [kUrl]: { hostname, protocol },
    [kResume]: resume,
    [kKeepAlive]: keepAlive
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

    if (requestTimeout != null && (!Number.isInteger(requestTimeout) || requestTimeout < 0)) {
      throw new InvalidArgumentError('requestTimeout must be a positive integer or zero')
    }

    this[kHandler] = handler

    this.method = method

    if (body == null) {
      this.body = null
    } else if (util.isStream(body)) {
      this.body = body
      // TODO: Cleanup listeners?
      this.body.on('error', (err) => {
        // TODO: Ignore error if body has ended?
        this.onError(err)
      })
    } else if (util.isBuffer(body)) {
      this.body = body.length ? body : null
    } else if (typeof body === 'string') {
      this.body = body.length ? Buffer.from(body) : null
    } else {
      throw new InvalidArgumentError('body must be a string, a Buffer or a Readable stream')
    }

    const hostHeader = headers && (headers.host || headers.Host)

    if (
      hostHeader &&
      protocol === 'https:' &&
      !/^\[/.test(hostHeader) &&
      !net.isIP(hostHeader)
    ) {
      this.servername = hostHeader
    } else {
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
      } else if (keepAlive) {
        header += 'connection: keep-alive\r\n'
      } else {
        header += 'connection: close\r\n'
      }

      if (!hostHeader) {
        header += `host: ${hostname}\r\n`
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

      this.header = header
    }

    this[kAbort] = () => {
      this.onError(new RequestAbortedError())
    }

    if (signal) {
      this[kSignal] = signal
      if ('addEventListener' in signal) {
        signal.addEventListener('abort', this[kAbort])
      } else {
        signal.addListener('abort', this[kAbort])
      }
    } else {
      this[kSignal] = null
    }

    this[kRequestTimeout] = requestTimeout != null ? requestTimeout : 30e3
    this[kTimeout] = null
    this[kResume] = resume
    this[kSocket] = null
  }

  get expectsPayload () {
    const { method } = this
    return (
      method === 'PUT' ||
      method === 'POST' ||
      method === 'PATCH'
    )
  }

  get reset () {
    const { method, upgrade, body } = this

    if (method === 'HEAD') {
      // https://github.com/mcollina/undici/issues/258

      // Close after a HEAD request to interop with misbehaving servers
      // that may send a body in the response.

      return true
    }

    if (method === 'CONNECT' || upgrade) {
      // On CONNECT or upgrade, block pipeline from dispatching further
      // requests on this connection.
      return true
    }

    if (body && !this.expectsPayload && util.bodyLength(body) !== 0) {
      // https://tools.ietf.org/html/rfc7231#section-4.3.1
      // https://tools.ietf.org/html/rfc7231#section-4.3.2
      // https://tools.ietf.org/html/rfc7231#section-4.3.5

      // Sending a payload body on a request that does not
      // expect it can cause undefined behavior on some
      // servers and corrupt connection state. Do not
      // re-use the connection for further requests.
      return true
    }

    return false
  }

  onConnect (socket) {
    assert(!this.aborted)

    this[kSocket] = socket

    try {
      this[kHandler].onConnect(this[kAbort])
    } catch (err) {
      this.onError(err)
    }

    if (this.aborted) {
      return false
    }

    if (this[kTimeout]) {
      clearTimeout(this[kTimeout])
    }

    this[kTimeout] = this[kRequestTimeout]
      ? setTimeout((self) => {
        self.onError(new RequestTimeoutError())
      }, this[kRequestTimeout], this)
      : null

    return true
  }

  onUpgrade (statusCode, headers, socket) {
    assert(!this.aborted)

    destroy(this)

    try {
      this[kHandler].onUpgrade(statusCode, headers, socket)
    } catch (err) {
      util.destroy(socket, err)
      this.onError(err)
    }
  }

  onHeaders (statusCode, headers, resume) {
    assert(!this.aborted)

    const {
      [kTimeout]: timeout
    } = this

    if (timeout) {
      this[kTimeout] = null
      clearTimeout(timeout)
    }

    try {
      this[kHandler].onHeaders(statusCode, headers, resume)
    } catch (err) {
      this.onError(err)
    }
  }

  onBody (chunk, offset, length) {
    assert(!this.aborted)

    try {
      return this[kHandler].onData(chunk.slice(offset, offset + length))
    } catch (err) {
      this.onError(err)
    }
  }

  onComplete (trailers) {
    assert(!this.aborted)

    destroy(this, null)

    try {
      this[kHandler].onComplete(trailers)
    } catch (err) {
      this.onError(err)
    }
  }

  onError (err) {
    if (this.aborted) {
      return
    }
    this.aborted = true

    destroy(this, err)

    // TODO: Try to avoid nextTick here.
    process.nextTick((handler, err) => {
      handler.onError(err)
    }, this[kHandler], err)
  }
}

function destroy (request, err) {
  const {
    body,
    [kTimeout]: timeout,
    [kSignal]: signal,
    [kResume]: resume,
    [kSocket]: socket
  } = request

  if (timeout) {
    request[kTimeout] = null
    clearTimeout(timeout)
  }

  if (body) {
    request.body = null
    util.destroy(body, err)
  }

  if (signal) {
    request[kSignal] = null
    if ('removeEventListener' in signal) {
      signal.removeEventListener('abort', request[kAbort])
    } else {
      signal.removeListener('abort', request[kAbort])
    }
  }

  if (err) {
    // Resume socket and state machine.

    request[kResume] = null
    resume()

    if (socket) {
      request[kSocket] = null
      socket.resume()
    }
  }
}

module.exports = Request
