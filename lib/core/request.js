'use strict'

const {
  InvalidArgumentError,
  NotSupportedError
} = require('./errors')
const assert = require('assert')
const querystring = require('querystring')
const util = require('./util')

const kHandler = Symbol('handler')

class Request {
  constructor ({
    path,
    method,
    body,
    headers,
    params,
    idempotent,
    upgrade
  }, handler) {
    if (typeof path !== 'string') {
      throw new InvalidArgumentError('path must be a string')
    } else if (path[0] !== '/' && !(path.startsWith('http://') || path.startsWith('https://'))) {
      throw new InvalidArgumentError('path must be an absolute URL or start with a slash')
    }

    if (typeof method !== 'string') {
      throw new InvalidArgumentError('method must be a string')
    }

    if (upgrade && typeof upgrade !== 'string') {
      throw new InvalidArgumentError('upgrade must be a string')
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

    this.upgrade = upgrade || method === 'CONNECT' || null

    this.path = params && Object.keys(params).length > 0 ? `${path}?${querystring.stringify(params)}` : path

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

    if (typeof handler.onConnect !== 'function') {
      throw new InvalidArgumentError('invalid onConnect method')
    }

    if (typeof handler.onError !== 'function') {
      throw new InvalidArgumentError('invalid onError method')
    }

    if (this.upgrade) {
      if (typeof handler.onUpgrade !== 'function') {
        throw new InvalidArgumentError('invalid onUpgrade method')
      }
    } else {
      if (typeof handler.onHeaders !== 'function') {
        throw new InvalidArgumentError('invalid onHeaders method')
      }

      if (typeof handler.onData !== 'function') {
        throw new InvalidArgumentError('invalid onData method')
      }

      if (typeof handler.onComplete !== 'function') {
        throw new InvalidArgumentError('invalid onComplete method')
      }
    }

    this[kHandler] = handler
  }

  onConnect (abort) {
    if (this.aborted) {
      return
    }
    return this[kHandler].onConnect(abort)
  }

  onHeaders (statusCode, headers, resume) {
    if (this.aborted) {
      return
    }
    return this[kHandler].onHeaders(statusCode, headers, resume)
  }

  onData (chunk) {
    if (this.aborted) {
      return
    }
    assert(!this.upgrade)
    return this[kHandler].onData(chunk)
  }

  onUpgrade (statusCode, headers, socket) {
    if (this.aborted) {
      return
    }
    assert(this.upgrade)
    return this[kHandler].onUpgrade(statusCode, headers, socket)
  }

  onComplete (trailers) {
    if (this.aborted) {
      return
    }
    assert(!this.upgrade)
    return this[kHandler].onComplete(trailers)
  }

  onError (err) {
    if (this.aborted) {
      return
    }
    this.aborted = true
    return this[kHandler].onError(err)
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
