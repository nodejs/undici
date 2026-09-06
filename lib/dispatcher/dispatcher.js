'use strict'
const EventEmitter = require('node:events')
const { kOriginless, kUrl } = require('../core/symbols')
const { hasSafeIterator } = require('../core/util')

function appendHeader (headers, key, value) {
  if (value === undefined) {
    return
  }

  key = key.toLowerCase()
  const current = headers[key]
  const values = Array.isArray(value) ? value : [value]

  if (current === undefined) {
    headers[key] = Array.isArray(value) ? value.slice() : value
  } else if (Array.isArray(current)) {
    current.push(...values)
  } else {
    headers[key] = [current, ...values]
  }
}

function normalizeHeaders (headers) {
  if (headers == null || typeof headers !== 'object') {
    return headers
  }

  const prototype = Object.getPrototypeOf(headers)
  if ((prototype === Object.prototype || prototype === null) && !Object.hasOwn(headers, Symbol.iterator)) {
    let normalized = true
    for (const key of Object.keys(headers)) {
      if (key !== key.toLowerCase()) {
        normalized = false
        break
      }
    }
    if (normalized) {
      return headers
    }
  }

  const normalized = {}

  if (Array.isArray(headers)) {
    if (headers.length > 0 && Array.isArray(headers[0])) {
      if (headers.some(header => !Array.isArray(header) || header.length !== 2)) {
        return headers
      }
      for (const [key, value] of headers) {
        appendHeader(normalized, key, value)
      }
    } else {
      if (headers.length % 2 !== 0) {
        return headers
      }
      for (let i = 0; i < headers.length; i += 2) {
        appendHeader(normalized, headers[i], headers[i + 1])
      }
    }
  } else if (typeof headers === 'object' && hasSafeIterator(headers)) {
    for (const [key, value] of headers) {
      appendHeader(normalized, key, value)
    }
  } else {
    for (const key of Object.keys(headers)) {
      appendHeader(normalized, key, headers[key])
    }
  }

  return normalized
}

class Dispatcher extends EventEmitter {
  dispatch () {
    throw new Error('not implemented')
  }

  close () {
    throw new Error('not implemented')
  }

  destroy () {
    throw new Error('not implemented')
  }

  compose (...args) {
    // So we handle [interceptor1, interceptor2] or interceptor1, interceptor2, ...
    const interceptors = Array.isArray(args[0]) ? args[0] : args
    // null disables origin-dependent interceptors; undefined uses opts.origin.
    const interceptorOrigin = this[kOriginless] === true
      ? null
      : this[kUrl]?.origin
    let dispatch = this.dispatch.bind(this)

    for (const interceptor of interceptors) {
      if (interceptor == null) {
        continue
      }

      if (typeof interceptor !== 'function') {
        throw new TypeError(`invalid interceptor, expected function received ${typeof interceptor}`)
      }

      dispatch = interceptor(dispatch, interceptorOrigin)

      if (dispatch == null || typeof dispatch !== 'function' || dispatch.length !== 2) {
        throw new TypeError('invalid interceptor')
      }
    }

    const originalDispatch = dispatch
    const self = this
    dispatch = function (opts, handler) {
      if (opts && typeof opts === 'object') {
        const origin = !opts.origin && self[kUrl] ? self[kUrl].origin : undefined
        const headers = opts.headers == null ? opts.headers : normalizeHeaders(opts.headers)

        if (origin || headers !== opts.headers) {
          opts = Object.assign({}, opts)
          if (origin) opts.origin = origin
          if (headers !== opts.headers) opts.headers = headers
        }
      }
      return originalDispatch(opts, handler)
    }

    return new Proxy(this, {
      get: (target, key) => key === 'dispatch' ? dispatch : target[key]
    })
  }
}

module.exports = Dispatcher
