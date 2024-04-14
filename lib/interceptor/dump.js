'use strict'

const util = require('../core/util')
const { InvalidArgumentError, RequestAbortedError } = require('../core/errors')

class DumpHandler {
  res = null
  maxSize = 1024 * 1024

  #abort = null
  #aborted = false
  #size = 0
  #contentLength = 0
  #reason = null
  #handler = null

  constructor ({ maxSize }, handler) {
    if (maxSize != null && (!Number.isFinite(maxSize) || maxSize < 1)) {
      throw new InvalidArgumentError('maxSize must be a number greater than 0')
    }

    this.maxSize = maxSize ?? this.maxSize
    this.#handler = handler

    // Handle possible onConnect duplication
    this.#handler.onConnect(reason => {
      this.#aborted = true
      if (this.#abort != null) {
        this.#abort(reason)
      } else {
        this.#reason = reason
      }
    })
  }

  onConnect (...args) {
    const [abort] = args
    if (this.#aborted) {
      abort(this.#reason)
      return
    }

    this.#abort = abort
  }

  onResponseStarted () {
    this.#handler.onResponseStarted?.()
  }

  onBodySent () {
    this.#handler.onBodySent?.()
  }

  onUpgrade (statusCode, headers, socket) {
    this.#handler.onUpgrade?.(statusCode, headers, socket)
  }

  // TODO: will require adjustment after new hooks are out
  onHeaders (statusCode, rawHeaders, resume, statusMessage) {
    const headers = util.parseHeaders(rawHeaders)
    const contentLength = headers['content-length']

    if (contentLength > this.maxSize) {
      this.#reason = new RequestAbortedError(
        `Response size (${contentLength}) larger than maxSize (${this.maxSize})`
      )

      this.#abort(this.#reason)
      return
    }

    this.#contentLength = contentLength
    this.#handler.onHeaders(statusCode, rawHeaders, resume, statusMessage)
  }

  onError (err) {
    this.#handler.onError(err)
  }

  onData (chunk) {
    this.#size = this.#size + chunk.length

    if (this.#size < this.maxSize) {
      return true
    }

    // TODO: shall we forward the rest of the data to the handler or better to abort?
  }

  onComplete (trailers) {
    this.#handler.onComplete(trailers)
  }
}

function createDumpInterceptor (
  { maxSize: defaultMaxSize } = { maxSize: 1024 * 1024 }
) {
  return dispatch => {
    return function Intercept (opts, handler) {
      const { dumpMaxSize = defaultMaxSize } = opts

      const redirectHandler = new DumpHandler({ maxSize: dumpMaxSize }, handler)

      return dispatch(opts, redirectHandler)
    }
  }
}

module.exports = createDumpInterceptor
