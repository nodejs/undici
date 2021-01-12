'use strict'
/* global WeakRef, FinalizationRegistry */

const assert = require('assert')
const { kDestroyed } = require('./symbols')
const { IncomingMessage } = require('http')
const util = require('util')
const net = require('net')
const { NotSupportedError } = require('./errors')

function nop () {}

function isStream (body) {
  return !!(body && typeof body.on === 'function')
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

/* istanbul ignore next: https://github.com/tc39/proposal-weakrefs */
function weakCache (fn) {
  /* istanbul ignore next: */
  if (typeof WeakRef === 'undefined' || typeof FinalizationRegistry === 'undefined') {
    throw new NotSupportedError('In order to use this feature, `WeakRef` and `FinalizationRegistry` must be defined as global objects. Check your Node.js version to be sure it is v14.6.0 or greater.')
  }

  const cache = new Map()
  const cleanup = new FinalizationRegistry(key => {
    // get the WeakRef from the cache
    const ref = cache.get(key)
    // if the WeakRef exists and the object has been reclaimed
    if (ref !== undefined && ref.deref() === undefined) {
      // remove the WeakRef from the cache
      cache.delete(key)
    }
  })
  return key => {
    // check the cache for an existing WeakRef
    const ref = cache.get(key)

    // if one exists in the cache try to return the WeakRef
    if (ref !== undefined) {
      const cached = ref.deref()
      if (cached !== undefined) {
        return cached
      }
    }

    // otherwise, if it isn't in the cache or the reference has been cleaned up, create a new one!
    const value = fn(key)
    // add a WeakRef of the value to the cache
    cache.set(key, new WeakRef(value))
    // add the value to the finalization registry
    cleanup.register(value, key)
    return value
  }
}

module.exports = {
  nop,
  getServerName,
  errnoException,
  isStream,
  isDestroyed,
  parseHeaders,
  parseKeepAliveTimeout,
  destroy,
  bodyLength,
  isBuffer,
  weakCache
}
