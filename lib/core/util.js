'use strict'

const assert = require('assert')
const { kDestroyed, kBodyUsed } = require('./symbols')
const { IncomingMessage } = require('http')
const stream = require('stream')
const net = require('net')
const { InvalidArgumentError } = require('./errors')
const { Blob } = require('buffer')

function nop () {}

function isStream (obj) {
  return obj && typeof obj.pipe === 'function'
}

function isBlob (obj) {
  return obj && Blob && obj instanceof Blob
}

function parseURL (url) {
  if (typeof url === 'string') {
    url = new URL(url)
  }

  if (!url || typeof url !== 'object') {
    throw new InvalidArgumentError('invalid url')
  }

  if (url.port != null && url.port !== '' && !Number.isFinite(parseInt(url.port))) {
    throw new InvalidArgumentError('invalid port')
  }

  if (url.path != null && typeof url.path !== 'string') {
    throw new InvalidArgumentError('invalid path')
  }

  if (url.pathname != null && typeof url.pathname !== 'string') {
    throw new InvalidArgumentError('invalid pathname')
  }

  if (url.hostname != null && typeof url.hostname !== 'string') {
    throw new InvalidArgumentError('invalid hostname')
  }

  if (url.origin != null && typeof url.origin !== 'string') {
    throw new InvalidArgumentError('invalid origin')
  }

  if (!/^https?:/.test(url.origin || url.protocol)) {
    throw new InvalidArgumentError('invalid protocol')
  }

  if (!(url instanceof URL)) {
    const port = url.port != null
      ? url.port
      : (url.protocol === 'https:' ? 443 : 80)
    const origin = url.origin != null
      ? url.origin
      : `${url.protocol}//${url.hostname}:${port}`
    const path = url.path != null
      ? url.path
      : `${url.pathname || ''}${url.search || ''}`

    url = new URL(path, origin)
  }

  return url
}

function parseOrigin (url) {
  url = parseURL(url)

  if (url.pathname !== '/' || url.search || url.hash) {
    throw new InvalidArgumentError('invalid url')
  }

  return url
}

function getServerName (host) {
  if (!host) {
    return null
  }

  assert.strictEqual(typeof host, 'string')

  if (host[0] === '[') {
    const idx = host.indexOf(']')

    assert(idx !== -1)
    return host.substr(1, idx - 1)
  }

  const idx = host.indexOf(':')
  if (idx === -1) return host

  return host.substr(0, idx)
}

function deepClone (obj) {
  return JSON.parse(JSON.stringify(obj))
}

function isAsyncIterable (obj) {
  return !!(obj != null && typeof obj[Symbol.asyncIterator] === 'function')
}

function isIterable (obj) {
  return !!(obj != null && (typeof obj[Symbol.iterator] === 'function' || typeof obj[Symbol.asyncIterator] === 'function'))
}

function bodyLength (body) {
  if (body == null) {
    return 0
  } else if (isStream(body)) {
    const state = body._readableState
    return state && state.ended === true && Number.isFinite(state.length)
      ? state.length
      : null
  } else if (isBlob(body)) {
    return body.size
  } else if (isBuffer(body)) {
    return body.byteLength
  }

  return null
}

function isDestroyed (stream) {
  return !stream || !!(stream.destroyed || stream[kDestroyed])
}

function isAborted (stream) {
  const state = stream && stream._readableState
  return isDestroyed(stream) && state && !state.endEmitted
}

function destroy (stream, err) {
  if (!isStream(stream) || isDestroyed(stream)) {
    return
  }

  if (typeof stream.destroy === 'function') {
    if (Object.getPrototypeOf(stream).constructor === IncomingMessage) {
      // See: https://github.com/nodejs/node/pull/38505/files
      stream.socket = null
    }
    stream.destroy(err)
  } else if (err) {
    process.nextTick((stream, err) => {
      stream.emit('error', err)
    }, stream, err)
  }

  if (stream.destroyed !== true) {
    stream[kDestroyed] = true
  }
}

const KEEPALIVE_TIMEOUT_EXPR = /timeout=(\d+)/
function parseKeepAliveTimeout (val) {
  const m = val.toString().match(KEEPALIVE_TIMEOUT_EXPR)
  return m ? parseInt(m[1], 10) * 1000 : null
}

function parseHeaders (headers, obj = {}) {
  for (let i = 0; i < headers.length; i += 2) {
    const key = headers[i].toString().toLowerCase()
    let val = obj[key]
    if (!val) {
      obj[key] = headers[i + 1].toString()
    } else {
      if (!Array.isArray(val)) {
        val = [val]
        obj[key] = val
      }
      val.push(headers[i + 1].toString())
    }
  }
  return obj
}

function isBuffer (buffer) {
  // See, https://github.com/mcollina/undici/pull/319
  return buffer instanceof Uint8Array || Buffer.isBuffer(buffer)
}

function validateHandler (handler, method, upgrade) {
  if (!handler || typeof handler !== 'object') {
    throw new InvalidArgumentError('handler must be an object')
  }

  if (typeof handler.onConnect !== 'function') {
    throw new InvalidArgumentError('invalid onConnect method')
  }

  if (typeof handler.onError !== 'function') {
    throw new InvalidArgumentError('invalid onError method')
  }

  if (typeof handler.onBodySent !== 'function' && handler.onBodySent !== undefined) {
    throw new InvalidArgumentError('invalid onBodySent method')
  }

  if (upgrade || method === 'CONNECT') {
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
}

// A body is disturbed if it has been read from and it cannot
// be re-used without losing state or data.
function isDisturbed (body) {
  const state = body && body._readableState
  return !!(body && (
    (stream.isDisturbed && stream.isDisturbed(body)) ||
    body[kBodyUsed] ||
    body.readableDidRead || (state && state.dataEmitted) ||
    isAborted(stream)
  ))
}

const kEnumerableProperty = Object.create(null)
kEnumerableProperty.enumerable = true

module.exports = {
  kEnumerableProperty,
  nop,
  isDisturbed,
  isAborted,
  parseOrigin,
  parseURL,
  getServerName,
  isStream,
  isIterable,
  isAsyncIterable,
  isDestroyed,
  parseHeaders,
  parseKeepAliveTimeout,
  destroy,
  bodyLength,
  deepClone,
  isBuffer,
  isBlob,
  validateHandler
}
