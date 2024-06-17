'use strict'

const { parseHeaders } = require('../core/util')
const createHttpError = require('http-errors')
const { DecoratorHandler } = require('undici')

class Handler extends DecoratorHandler {
  #handler
  #statusCode
  #contentType
  #decoder
  #headers
  #body
  #errored

  constructor (opts, { handler }) {
    super(handler)
    this.#handler = handler
    this.opts = opts
  }

  onConnect (abort) {
    this.#statusCode = 0
    this.#contentType = null
    this.#decoder = null
    this.#headers = null
    this.#body = ''
    this.#errored = false

    return this.#handler.onConnect(abort)
  }

  onHeaders (statusCode, rawHeaders, resume, statusMessage, headers = parseHeaders(rawHeaders)) {
    this.#statusCode = statusCode
    this.#headers = headers
    this.#contentType = headers['content-type']

    if (this.#statusCode < 400) {
      return this.#handler.onHeaders(statusCode, rawHeaders, resume, statusMessage, headers)
    }

    if (this.#contentType === 'application/json' || this.#contentType === 'text/plain') {
      this.#decoder = new TextDecoder('utf-8')
    }
  }

  onData (chunk) {
    if (this.#statusCode >= 400) {
      this.#body += this.#decoder?.decode(chunk, { stream: true }) ?? ''
    } else {
      return this.#handler.onData(chunk)
    }
  }

  onComplete (rawTrailers) {
    if (this.#statusCode >= 400) {
      this.#body += this.#decoder?.decode(undefined, { stream: false }) ?? ''

      if (this.#contentType === 'application/json') {
        try {
          this.#body = JSON.parse(this.#body)
        } catch {
          // Do nothing...
        }
      }

      this.#errored = true

      let err

      const stackTraceLimit = Error.stackTraceLimit
      Error.stackTraceLimit = 0
      try {
        err = Object.assign(new Error(http.STATUS_CODES[this.#statusCode]), {
          statusCode: this.#statusCode,
          status: this.#statusCode,
          reason: this.#body?.reason,
          error: this.#body?.error,
          headers: this.#headers,
          body: this.#body
        })
      } finally {
        Error.stackTraceLimit = stackTraceLimit
      }

      if (this.opts.throwOnError !== false && this.opts.error !== false) {
        this.#handler.onError(err)
      } else {
        this.#handler.onComplete(rawTrailers)
      }
    } else {
      this.#handler.onComplete(rawTrailers)
    }
  }

  onError (err) {
    if (this.#errored) {
      // Do nothing...
    } else {
      if (this.opts.throwOnError !== false && this.opts.error !== false) {
        this.#handler.onError(err)
      } else {
        this.#handler.onComplete()
      }
    }
  }
}

module.exports = (dispatch) => (opts, handler) =>
  opts.error !== false && opts.throwOnError !== false
    ? dispatch(opts, new Handler(opts, { handler }))
    : dispatch(opts, handler)
