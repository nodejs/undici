'use strict'

const util = require('../core/util')
const { InvalidArgumentError, RequestAbortedError } = require('../core/errors')
const DecoratorHandler = require('../handler/decorator-handler')

class DumpHandler extends DecoratorHandler {
  #maxSize = 1024 * 1024
  #abort = null
  #abortOnDumped = true
  #waitForTrailers = false
  #hasTrailers = false
  #dumped = false
  #aborted = false
  #completed = false
  #size = 0
  #reason = null
  #handler = null

  constructor ({ maxSize, abortOnDumped, waitForTrailers }, handler) {
    super(handler)

    if (maxSize != null && (!Number.isFinite(maxSize) || maxSize < 1)) {
      throw new InvalidArgumentError('maxSize must be a number greater than 0')
    }

    if (abortOnDumped != null && typeof abortOnDumped !== 'boolean') {
      throw new InvalidArgumentError('abortOnDumped must be a boolean')
    }

    if (waitForTrailers != null && typeof waitForTrailers !== 'boolean') {
      throw new InvalidArgumentError('waitForTrailers must be a boolean')
    }

    this.#maxSize = maxSize ?? this.#maxSize
    this.#abortOnDumped = abortOnDumped ?? this.#abortOnDumped
    this.#waitForTrailers = waitForTrailers ?? this.#waitForTrailers
    this.#handler = handler
  }

  onConnect (abort) {
    if (this.#aborted) {
      abort(this.#reason)
      return
    }

    this.#abort = abort
  }

  // TODO: will require adjustment after new hooks are out
  onHeaders (statusCode, rawHeaders, resume, statusMessage) {
    const headers = util.parseHeaders(rawHeaders)
    const contentLength = headers['content-length']

    if (contentLength != null && contentLength > this.#maxSize) {
      throw new RequestAbortedError(
        `Response size (${contentLength}) larger than maxSize (${
          this.#maxSize
        })`
      )
    }

    if (this.#waitForTrailers) {
      this.#hasTrailers = headers.trailer != null
    }

    return this.#handler.onHeaders(
      statusCode,
      rawHeaders,
      resume,
      statusMessage
    )
  }

  onError (err) {
    if (
      !(err instanceof RequestAbortedError) &&
      (!this.#dumped || this.#aborted)
    ) {
      this.#handler.onError(err)
      return
    }

    if (!this.#completed) {
      this.#handler.onComplete([])
    }
  }

  onData (chunk) {
    this.#size = this.#size + chunk.length

    if (this.#size >= this.#maxSize) {
      this.#dumped = true

      if (
        this.#abortOnDumped &&
        (!this.#waitForTrailers || !this.#hasTrailers)
      ) {
        this.#reason = new RequestAbortedError(
          `Response dumped (${this.#size}) for max size (${this.#maxSize})`
        )

        this.#abort(this.#reason)
        return false
      }
    }

    return true
  }

  onComplete (trailers) {
    this.#completed = true
    this.#handler.onComplete(trailers)

    if (this.#dumped && this.#abortOnDumped) {
      this.#reason = new RequestAbortedError(
        `Response dumped (${this.#size}) for max size (${this.#maxSize})`
      )

      this.#handler.onError(this.#reason)
    }
  }
}

function createDumpInterceptor (
  {
    maxSize: defaultMaxSize,
    abortOnDumped: defaultAbortOnDumped,
    waitForTrailers: defaultWaitForTrailers
  } = {
    maxSize: 1024 * 1024,
    abortOnDumped: true,
    waitForTrailers: false
  }
) {
  return dispatch => {
    return function Intercept (opts, handler) {
      const {
        dumpMaxSize = defaultMaxSize,
        abortOnDumped = defaultAbortOnDumped,
        waitForTrailers = defaultWaitForTrailers
      } = opts

      const dumpHandler = new DumpHandler(
        { maxSize: dumpMaxSize, abortOnDumped, waitForTrailers },
        handler
      )

      return dispatch(opts, dumpHandler)
    }
  }
}

module.exports = createDumpInterceptor
