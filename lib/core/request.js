'use strict'

const {
  InvalidArgumentError,
  RequestAbortedError,
  RequestTimeoutError,
  NotSupportedError
} = require('./errors')
const util = require('./util')
const assert = require('assert')

const kRequestTimeout = Symbol('request timeout')
const kTimeout = Symbol('timeout')
const kHandler = Symbol('handler')

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
    requestTimeout
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

    if (requestTimeout != null && (!Number.isInteger(requestTimeout) || requestTimeout < 0)) {
      throw new InvalidArgumentError('requestTimeout must be a positive integer or zero')
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

    this[kRequestTimeout] = requestTimeout != null ? requestTimeout : 30e3
    this[kTimeout] = null
    this[kHandler] = handler
  }

  onConnect (resume) {
    assert(!this.aborted)

    const abort = (err) => {
      if (!this.aborted) {
        this.onError(err || new RequestAbortedError())
        resume()
      }
    }

    if (this[kRequestTimeout]) {
      if (this[kTimeout]) {
        clearTimeout(this[kTimeout])
      }

      this[kTimeout] = setTimeout((abort) => {
        abort(new RequestTimeoutError())
      }, this[kRequestTimeout], abort)
    }

    this[kHandler].onConnect(abort)
  }

  onHeaders (statusCode, headers, resume) {
    assert(!this.aborted)

    clearRequestTimeout(this)

    return this[kHandler].onHeaders(statusCode, headers, resume)
  }

  onBody (chunk, offset, length) {
    assert(!this.aborted)

    return this[kHandler].onData(chunk.slice(offset, offset + length))
  }

  onUpgrade (statusCode, headers, socket) {
    assert(!this.aborted)

    clearRequestTimeout(this)

    this[kHandler].onUpgrade(statusCode, headers, socket)
  }

  onComplete (trailers) {
    assert(!this.aborted)

    clearRequestTimeout(this)

    this[kHandler].onComplete(trailers)
  }

  onError (err) {
    if (this.aborted) {
      return
    }
    this.aborted = true

    clearRequestTimeout(this)

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

function clearRequestTimeout (request) {
  const { [kTimeout]: timeout } = request
  if (timeout) {
    request[kTimeout] = null
    clearTimeout(timeout)
  }
}

module.exports = Request
