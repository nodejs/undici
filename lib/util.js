'use strict'

const assert = require('assert')
const { kDestroyed } = require('./symbols')
const { IncomingMessage } = require('http')

function nop () {}

function isStream (body) {
  return !!(body && typeof body.on === 'function')
}

function bodyLength (body, doRead) {
  if (body && typeof body.on === 'function') {
    if (doRead && typeof body.read === 'function') {
      body.read(0)
    }
    const state = body._readableState
    return state && state.ended === true && Number.isFinite(state.length)
      ? state.length
      : null
  }

  assert(!body || Number.isFinite(body.byteLength))

  return body ? body.byteLength : 0
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

function parseHeaders (headers, obj) {
  obj = obj || {}
  if (!headers) {
    return obj
  }
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

module.exports = {
  nop,
  isStream,
  isDestroyed,
  parseHeaders,
  destroy,
  bodyLength
}
