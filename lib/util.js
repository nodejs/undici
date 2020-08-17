'use strict'

const assert = require('assert')
const { kDestroyed } = require('./symbols')
const { IncomingMessage } = require('http')

function nop () {}

function isStream (body) {
  return !!(body && typeof body.on === 'function')
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

function parseKeepAliveTimeout (shouldKeepAlive, headers) {
  if (!shouldKeepAlive) {
    return null
  }

  let keepAliveHeader
  for (let n = 0; n < headers.length; n += 2) {
    const key = headers[n + 0]
    if (key.length === 10 && key.toLowerCase() === 'keep-alive') {
      keepAliveHeader = headers[n + 1]
      break
    }
  }

  const m = keepAliveHeader && keepAliveHeader.match(/timeout=(\d+)/)
  return m ? Number(m[1]) * 1000 : null
}

function parseHeaders (headers) {
  const obj = {}
  for (var i = 0; i < headers.length; i += 2) {
    var key = headers[i].toLowerCase()
    var val = obj[key]
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

module.exports = {
  nop,
  isStream,
  isDestroyed,
  parseHeaders,
  parseKeepAliveTimeout,
  destroy,
  bodyLength,
  isBuffer
}
