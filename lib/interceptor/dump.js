'use strict'

const util = require('../core/util')
const { InvalidArgumentError, RequestAbortedError } = require('../core/errors')
const DecoratorHandler = require('../handler/decorator-handler')

class DumpHandler extends DecoratorHandler {
  #maxSize = 1024 * 1024
  #abort = null
  #dumpOnAbort = true
  #dumped = false
  #aborted = false
  #size = 0
  #reason = null
  #handler = null

  constructor ({ maxSize, dumpOnAbort }, handler) {
    super(handler)

    if (maxSize != null && (!Number.isFinite(maxSize) || maxSize < 1)) {
      throw new InvalidArgumentError('maxSize must be a number greater than 0')
    }

    if (dumpOnAbort != null && typeof dumpOnAbort !== 'boolean') {
      throw new InvalidArgumentError('dumpOnAbort must be a boolean')
    }

    this.#maxSize = maxSize ?? this.#maxSize
    this.#dumpOnAbort = dumpOnAbort ?? this.#dumpOnAbort
    this.#handler = handler
  }

  onConnect (abort) {
    if (this.#aborted) {
      abort(this.#reason)
      return
    }

    this.#abort = abort

    this.#handler.onConnect(
      this.#dumpOnAbort === true ? this.#customAbort.bind(this) : this.#abort
    )
  }

  #customAbort (reason) {
    this.#aborted = true
    this.#reason = reason
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

    if (!this.#dumped) {
      this.#handler.onComplete([])
    }
  }

  onData (chunk) {
    this.#size = this.#size + chunk.length

    if (this.#size >= this.#maxSize) {
      this.#dumped = true

      if (this.#aborted) {
        this.#handler.onError(this.reason)
      } else {
        this.#handler.onComplete([])
      }
    }

    return true
  }

  onComplete (trailers) {
    if (this.#aborted) {
      this.#handler.onError(this.reason)
      return
    }

    if (!this.#dumped) {
      this.#handler.onComplete(trailers)
    }
  }
}

function createDumpInterceptor (
  { maxSize: defaultMaxSize, dumpOnAbort: defaultDumpOnAbort } = {
    maxSize: 1024 * 1024,
    dumpOnAbort: true
  }
) {
  return dispatch => {
    return function Intercept (opts, handler) {
      const { dumpMaxSize = defaultMaxSize, dumpOnAbort = defaultDumpOnAbort } =
        opts

      const dumpHandler = new DumpHandler(
        { maxSize: dumpMaxSize, dumpOnAbort },
        handler
      )

      return dispatch(opts, dumpHandler)
    }
  }
}

module.exports = createDumpInterceptor
