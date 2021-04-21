'use strict'

const assert = require('assert')
const { kDestroyed } = require('./symbols')
const { IncomingMessage } = require('http')
const util = require('util')
const net = require('net')
const { InvalidArgumentError } = require('./errors')

function nop () {}

function isStream (body) {
  return !!(body && typeof body.on === 'function')
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

  if (url.hostname != null && typeof url.hostname !== 'string') {
    throw new InvalidArgumentError('invalid hostname')
  }

  if (!/https?/.test(url.protocol)) {
    throw new InvalidArgumentError('invalid protocol')
  }

  if (!(url instanceof URL)) {
    const port = url.port || {
      'http:': 80,
      'https:': 443
    }[url.protocol]
    assert(port != null)
    const path = url.path || `${url.pathname || '/'}${url.search || ''}`
    url = new URL(`${url.protocol}//${url.hostname}:${port}${path}`)
  }

  return url
}

function parseOrigin (url) {
  url = parseURL(url)

  if (/\/.+/.test(url.pathname) || url.search || url.hash) {
    throw new InvalidArgumentError('invalid url')
  }

  return url
}

function getServerName (host) {
  if (!host) {
    return null
  }

  let servername = host

  if (servername.startsWith('[')) {
    const idx = servername.indexOf(']')
    servername = idx === -1 ? servername : servername.substr(1, idx - 1)
  } else {
    servername = servername.split(':', 1)[0]
  }

  if (net.isIP(servername)) {
    servername = null
  }

  return servername
}

function bodyLength (body) {
  if (body && typeof body.on === 'function') {
    const state = body._readableState
    return state && state.ended === true && Number.isFinite(state.length)
      ? state.length
      : null
  }

  assert(!body || Number.isFinite(body.byteLength))

  return body ? body.length : 0
}

function isDestroyed (stream) {
  return !stream || !!(stream.destroyed || stream[kDestroyed])
}

function destroy (stream, err) {
  if (!isStream(stream) || isDestroyed(stream)) {
    return
  }

  if (typeof stream.destroy === 'function') {
    if (err || Object.getPrototypeOf(stream).constructor !== IncomingMessage) {
      stream.destroy(err)
    }
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
  const m = val.match(KEEPALIVE_TIMEOUT_EXPR)
  return m ? parseInt(m[1]) * 1000 : null
}

function parseHeaders (headers, obj = {}) {
  for (let i = 0; i < headers.length; i += 2) {
    const key = headers[i].toLowerCase()
    let val = obj[key]
    if (!val) {
      obj[key] = headers[i + 1]
    } else {
      if (!Array.isArray(val)) {
        val = [val]
        obj[key] = val
      }
      val.push(headers[i + 1])
    }
  }
  return obj
}

function isBuffer (buffer) {
  // See, https://github.com/mcollina/undici/pull/319
  return buffer instanceof Uint8Array || Buffer.isBuffer(buffer)
}

function errnoException (code, syscall) {
  const name = util.getSystemErrorName(code)

  const err = new Error(`${syscall} ${name}`)
  err.errno = err
  err.code = code
  err.syscall = syscall

  return err
}

module.exports = {
  nop,
  parseOrigin,
  parseURL,
  getServerName,
  errnoException,
  isStream,
  isDestroyed,
  parseHeaders,
  parseKeepAliveTimeout,
  destroy,
  bodyLength,
  isBuffer,
  queueMicrotask: global.queueMicrotask ? global.queueMicrotask.bind(global) : cb => Promise.resolve()
    .then(cb)
    .catch(err => setTimeout(() => { throw err }, 0))
}
