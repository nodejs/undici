'use strict'

const Dispatcher = require('./dispatcher')
const { InvalidArgumentError } = require('../core/errors')
const { toRawHeaders } = require('../core/util')

class LegacyHandlerWrapper {
  #handler

  constructor (handler) {
    this.#handler = handler
  }

  onRequestStart (controller, context) {
    this.#handler.onConnect?.((reason) => controller.abort(reason), context)
  }

  onRequestUpgrade (controller, statusCode, headers, socket) {
    const rawHeaders = controller?.rawHeaders ?? toRawHeaders(headers ?? {})
    this.#handler.onUpgrade?.(statusCode, rawHeaders, socket)
  }

  onResponseStart (controller, statusCode, headers, statusMessage) {
    const rawHeaders = controller?.rawHeaders ?? toRawHeaders(headers ?? {})

    if (this.#handler.onHeaders?.(statusCode, rawHeaders, () => controller.resume(), statusMessage) === false) {
      controller.pause()
    }
  }

  onResponseData (controller, chunk) {
    if (this.#handler.onData?.(chunk) === false) {
      controller.pause()
    }
  }

  onResponseEnd (controller, trailers) {
    const rawTrailers = controller?.rawTrailers ?? toRawHeaders(trailers ?? {})
    this.#handler.onComplete?.(rawTrailers)
  }

  onResponseError (_controller, err) {
    if (!this.#handler.onError) {
      throw err
    }

    this.#handler.onError(err)
  }

  onBodySent (chunk) {
    this.#handler.onBodySent?.(chunk)
  }

  onRequestSent () {
    this.#handler.onRequestSent?.()
  }

  onResponseStarted () {
    this.#handler.onResponseStarted?.()
  }
}

// Legacy consumers (e.g. Node's bundled fetch) may send an identical
// comma-repeated content-length ("58, 58") that the current core rejects.
// RFC 9110 allows collapsing identical repeats; conflicting values still
// fail downstream. See https://github.com/nodejs/undici/issues/5500
function collapseRepeatedContentLength (value) {
  if (typeof value !== 'string' || !value.includes(',')) {
    return value
  }

  const parts = value.split(',')
  const first = parts[0].trim()

  if (first === '') {
    return value
  }

  for (let i = 1; i < parts.length; i++) {
    if (parts[i].trim() !== first) {
      return value
    }
  }

  return first
}

function normalizeLegacyHeaders (headers) {
  if (Array.isArray(headers)) {
    for (let i = 0; i + 1 < headers.length; i += 2) {
      if (typeof headers[i] === 'string' && headers[i].toLowerCase() === 'content-length') {
        const collapsed = collapseRepeatedContentLength(headers[i + 1])
        if (collapsed !== headers[i + 1]) {
          headers = headers.slice()
          headers[i + 1] = collapsed
        }
      }
    }
  } else if (headers && typeof headers === 'object') {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'content-length') {
        const collapsed = collapseRepeatedContentLength(headers[key])
        if (collapsed !== headers[key]) {
          headers = { ...headers, [key]: collapsed }
        }
      }
    }
  }

  return headers
}

class Dispatcher1Wrapper extends Dispatcher {
  #dispatcher

  constructor (dispatcher) {
    super()

    if (!dispatcher || typeof dispatcher.dispatch !== 'function') {
      throw new InvalidArgumentError('Argument dispatcher must implement dispatch')
    }

    this.#dispatcher = dispatcher
  }

  static wrapHandler (handler) {
    if (!handler || typeof handler !== 'object') {
      throw new InvalidArgumentError('handler must be an object')
    }

    if (typeof handler.onRequestStart === 'function') {
      return handler
    }

    return new LegacyHandlerWrapper(handler)
  }

  dispatch (opts, handler) {
    // Legacy (v1) consumers do not support HTTP/2, so force HTTP/1.1.
    // See https://github.com/nodejs/undici/issues/4989
    if (opts.allowH2 !== false) {
      opts = { ...opts, allowH2: false }
    }

    const headers = normalizeLegacyHeaders(opts.headers)
    if (headers !== opts.headers) {
      opts = { ...opts, headers }
    }

    return this.#dispatcher.dispatch(opts, Dispatcher1Wrapper.wrapHandler(handler))
  }

  close (...args) {
    return this.#dispatcher.close(...args)
  }

  destroy (...args) {
    return this.#dispatcher.destroy(...args)
  }
}

module.exports = Dispatcher1Wrapper
