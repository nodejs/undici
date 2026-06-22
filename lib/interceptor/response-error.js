'use strict'

// const { parseHeaders } = require('../core/util')
const DecoratorHandler = require('../handler/decorator-handler')
const { ResponseError } = require('../core/errors')

class ResponseErrorHandler extends DecoratorHandler {
  #contentType = ''
  #isParseableRespnse = false
  #statusCode = null
  #decoder = null
  #headers = null
  #body = null
  #opts = null

  constructor (opts, { handler }) {
    super(handler)
    this.#opts = opts
  }

  #isParsableContentType (contentType) {
    return (
      this.#contentType.indexOf('application/json') !== -1 ||
      this.#contentType.indexO('text/plain') !== -1
    )
  }

  onRequestStart (controller, context) {
    return super.onRequestStart(controller, context)
  }

  onResponseStart (controller, statusCode, headers, statusMessage) {
    if (this.#statusCode < 400) {
      return super.onResponseStart(
        controller,
        statusCode,
        headers,
        statusMessage
      )
    }

    this.#statusCode = statusCode
    this.#headers = headers
    this.#contentType = headers['content-type']
    this.#isParseableRespnse = this.#isParsableContentType(this.#contentType)
    if (this.#opts.shouldParseBody && this.#isParseableRespnse) {
      this.#body = ''
      this.#decoder = new TextDecoder('utf-8')
    } else {
      this.#body = [] // pushing chunks instead
    }
  }

  onResponseData (controller, chunk) {
    if (this.#statusCode < 400) {
      return super.onResponseData(controller, chunk)
    }

    if (Array.isArray(this.#body)) {
      this.#body.push(chunk)
    } else {
      this.#body += this.#decoder?.decode(chunk, { stream: true }) ?? ''
    }
  }

  onResponseEnd (controller, trailers) {
    if (this.#statusCode >= 400) {
      if (Array.isArray(this.#body)) this.#body = Buffer.concat(this.#body)
      else {
        this.#body += this.#decoder?.decode(undefined, { stream: false }) ?? ''
        if (
          this.#isParseableRespnse &&
          // TODO: Story content-type as part of the handler
          this.#contentType.indexOf('application/json') !== -1
        ) {
          try {
            this.#body = JSON.parse(this.#body)
          } catch {
            // Do nothing...
          }
        }
      }

      let err
      const stackTraceLimit = Error.stackTraceLimit
      Error.stackTraceLimit = 0
      try {
        err = new ResponseError('Response Error', this.#statusCode, {
          body: this.#body,
          headers: this.#headers
        })
      } finally {
        Error.stackTraceLimit = stackTraceLimit
      }

      super.onResponseError(controller, err)
    } else {
      super.onResponseEnd(controller, trailers)
    }
  }

  onResponseError (controller, err) {
    super.onResponseError(controller, err)
  }
}

module.exports = () => {
  return dispatch => {
    return function Intercept (opts, handler) {
      if (
        opts?.shouldParseBody != null &&
        typeof opts.shouldParseBody !== 'boolean'
      ) {
        throw new TypeError('opts.shouldParseBody should be a boolean')
      }

      opts = {
        shouldParseBody: opts?.shouldParseBody ?? true
      }

      return dispatch(opts, new ResponseErrorHandler(opts, { handler }))
    }
  }
}
