'use strict'

const {
  InvalidArgumentError,
  BodyTimeoutError,
  RequestAbortedError,
  HeadersTimeoutError,
  NotSupportedError
} = require('./errors')
const util = require('./util')
const assert = require('assert')

const kHeadersTimeout = Symbol('headers timeout')
const kBodyTimeout = Symbol('body timeout')
const kTimeout = Symbol('timeout')
const kHandler = Symbol('handler')
const kPaused = Symbol('paused')
const kAbort = Symbol('abort')

// Borrowed from https://gist.github.com/dperini/729294
// eslint-disable-next-line no-control-regex
const REGEXP_ABSOLUTE_URL = /^(?:(?:https?|ftp):\/\/)(?:\S+(?::\S*)?@)?(?:(?!10(?:\.\d{1,3}){3})(?!127(?:\.\d{1,3}){3})(?!169\.254(?:\.\d{1,3}){2})(?!192\.168(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\x00a1-\xffff0-9]+-?)*[a-z\x00a1-\xffff0-9]+)(?:\.(?:[a-z\x00a1-\xffff0-9]+-?)*[a-z\x00a1-\xffff0-9]+)*(?:\.(?:[a-z\x00a1-\xffff]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/ius

class Request {
  constructor ({
    path,
    method,
    body,
    headers,
    idempotent,
    upgrade,
    headersTimeout,
    bodyTimeout
  }, handler) {
    if (typeof path !== 'string') {
      throw new InvalidArgumentError('path must be a string')
    } else if (path[0] !== '/' && !REGEXP_ABSOLUTE_URL.test(path)) {
      throw new InvalidArgumentError('path must be an absolute URL or start with a slash')
    }

    if (typeof method !== 'string') {
      throw new InvalidArgumentError('method must be a string')
    }

    if (upgrade && typeof upgrade !== 'string') {
      throw new InvalidArgumentError('upgrade must be a string')
    }

    if (headersTimeout != null && (!Number.isInteger(headersTimeout) || headersTimeout < 0)) {
      throw new InvalidArgumentError('headersTimeout must be a positive integer or zero')
    }

    if (bodyTimeout != null && (!Number.isInteger(bodyTimeout) || bodyTimeout < 0)) {
      throw new InvalidArgumentError('bodyTimeout must be a positive integer or zero')
    }

    this.method = method

    if (body == null) {
      this.body = null
    } else if (util.isStream(body)) {
      this.body = body
    } else if (util.isBuffer(body)) {
      this.body = body.length ? body : null
    } else if (typeof body === 'string') {
      this.body = body.length ? Buffer.from(body) : null
    } else {
      throw new InvalidArgumentError('body must be a string, a Buffer or a Readable stream')
    }

    this.aborted = false

    this.upgrade = upgrade

    this.path = path

    this.idempotent = idempotent == null
      ? method === 'HEAD' || method === 'GET'
      : idempotent

    this.host = null

    this.contentLength = null

    this.headers = ''

    if (Array.isArray(headers)) {
      if (headers.length % 2 !== 0) {
        throw new InvalidArgumentError('headers array must be even')
      }
      for (let i = 0; i < headers.length; i += 2) {
        processHeader(this, headers[i + 0], headers[i + 1])
      }
    } else if (headers && typeof headers === 'object') {
      for (const [key, val] of Object.entries(headers)) {
        processHeader(this, key, val)
      }
    } else if (headers != null) {
      throw new InvalidArgumentError('headers must be an object or an array')
    }

    this[kPaused] = null
    this[kHeadersTimeout] = headersTimeout != null ? headersTimeout : 30e3
    this[kBodyTimeout] = bodyTimeout != null ? bodyTimeout : 30e3
    this[kTimeout] = null
    this[kHandler] = handler
    this[kAbort] = null
  }

  onConnect (resume) {
    assert(!this.aborted)

    this[kAbort] = (err) => {
      if (!this.aborted) {
        this.onError(err || new RequestAbortedError())
        resume()
      }
    }

    if (this[kHeadersTimeout]) {
      clearTimeout(this[kTimeout])
      this[kTimeout] = setTimeout((self) => {
        self[kAbort](new HeadersTimeoutError())
      }, this[kHeadersTimeout], this)
    }

    this[kHandler].onConnect(this[kAbort])
  }

  onHeaders (statusCode, headers, resume) {
    assert(!this.aborted)

    if (statusCode >= 200) {
      clearTimeout(this[kTimeout])
      this[kTimeout] = this[kBodyTimeout]
        ? setTimeout((self) => {
          if (!self[kPaused]) {
            self[kAbort](new BodyTimeoutError())
          }
        }, this[kBodyTimeout], this)
        : null
    } else if (this[kTimeout] && this[kTimeout].refresh) {
      this[kTimeout].refresh()
    }

    const ret = this[kHandler].onHeaders(statusCode, headers, () => {
      if (this[kTimeout] && this[kTimeout].refresh) {
        this[kTimeout].refresh()
      }

      this[kPaused] = false

      resume()
    })

    if (ret === false) {
      this[kPaused] = true
    }

    return ret
  }

  onBody (chunk, offset, length) {
    assert(!this.aborted)
    assert(!this[kPaused])

    if (this[kTimeout] && this[kTimeout].refresh) {
      this[kTimeout].refresh()
    }

    const ret = this[kHandler].onData(chunk.slice(offset, offset + length))

    if (ret === false) {
      this[kPaused] = true
    }

    return ret
  }

  onUpgrade (statusCode, headers, socket) {
    assert(!this.aborted)

    clearTimeout(this[kTimeout])
    this[kTimeout] = null

    this[kHandler].onUpgrade(statusCode, headers, socket)
  }

  onComplete (trailers) {
    assert(!this.aborted)

    clearTimeout(this[kTimeout])
    this[kTimeout] = null

    this[kHandler].onComplete(trailers)
  }

  onError (err) {
    if (this.aborted) {
      return
    }
    this.aborted = true

    clearTimeout(this[kTimeout])
    this[kTimeout] = null

    this[kHandler].onError(err)
  }
}

function processHeader (request, key, val) {
  if (val && typeof val === 'object') {
    throw new InvalidArgumentError(`invalid ${key} header`)
  } else if (val === undefined) {
    return
  }

  if (
    request.host === null &&
    key.length === 4 &&
    key.toLowerCase() === 'host'
  ) {
    request.host = val
    request.headers += `${key}: ${val}\r\n`
  } else if (
    request.contentLength === null &&
    key.length === 14 &&
    key.toLowerCase() === 'content-length'
  ) {
    request.contentLength = parseInt(val)
    if (!Number.isFinite(request.contentLength)) {
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
    request.headers += `${key}: ${val}\r\n`
  }
}

module.exports = Request
