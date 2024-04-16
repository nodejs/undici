'use strict'
const assert = require('node:assert')

const DecoratorHandler = require('./decorator-handler')
const { isDisturbed, parseHeaders, parseRangeHeader } = require('../core/util')
const { ResponseStatusCodeError } = require('../core/errors')

class RetryHandler extends DecoratorHandler {
  #dispatch
  #handler
  #opts
  #abort

  #retryOpts
  #retryCount = -1
  #retryCountCheckpoint = 0

  #headersSent = false
  #aborted = false
  #reason = null
  #pos
  #end
  #etag

  constructor (opts, { dispatch, handler }) {
    super(handler)

    const { retryOptions, ...dispatchOpts } = opts
    const {
      // Retry scoped
      retry: retryFn,
      maxRetries,
      maxTimeout,
      minTimeout,
      timeoutFactor,
      // Response scoped
      methods,
      errorCodes,
      retryAfter,
      statusCodes
    } = retryOptions ?? {}

    this.#opts = dispatchOpts // TODO (fix): This assumes that opts are not mutated...
    this.#dispatch = dispatch
    this.#handler = handler
    this.#abort = null
    this.#aborted = false
    this.#retryOpts = {
      retry: retryFn ?? defaultRetry,
      retryAfter: retryAfter ?? true,
      maxTimeout: maxTimeout ?? 30 * 1000, // 30s,
      minTimeout: minTimeout ?? 500, // .5s
      timeoutFactor: timeoutFactor ?? 2,
      maxRetries: maxRetries ?? 5,
      // What errors we should retry
      methods: methods ?? ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'TRACE'],
      // Indicates which errors to retry
      statusCodes: statusCodes ?? [500, 502, 503, 504, 429],
      // List of errors to retry
      errorCodes: errorCodes ?? [
        'ECONNRESET',
        'ECONNREFUSED',
        'ENOTFOUND',
        'ENETDOWN',
        'ENETUNREACH',
        'EHOSTDOWN',
        'EHOSTUNREACH',
        'EPIPE',
        'UND_ERR_SOCKET'
      ]
    }

    // Handle possible onConnect duplication.
    this.#handler.onConnect(reason => {
      this.#aborted = true
      if (this.#abort) {
        this.#abort(reason)
      } else {
        this.#reason = reason
      }
    })
  }

  onConnect (abort) {
    this.#retryCount += 1

    if (this.#aborted) {
      abort(this.#reason)
    } else {
      this.abort = abort
    }
  }

  onHeaders (statusCode, rawHeaders, resume, statusMessage) {
    const headers = parseHeaders(rawHeaders)

    if (statusCode >= 300) {
      if (this.#retryOpts.statusCodes.includes(statusCode)) {
        // TODO (fix): Remove this path and delegate to different interceptor which will read the error body?
        const message = `Response status code ${statusCode}${statusMessage ? `: ${statusMessage}` : ''}`
        throw new ResponseStatusCodeError(message, statusCode, headers)
      }

      this.#headersSent = true
      return this.#handler.onHeaders(statusCode, rawHeaders, resume, statusMessage)
    } else if (this.#reason == null) {
      assert(this.#etag = null)
      assert(this.#pos == null)
      assert(this.#end == null)
      assert(this.#headersSent === false)

      if (headers.trailer) {
        this.#headersSent = true
        return this.#handler.onHeaders(statusCode, rawHeaders, resume, statusMessage)
      }

      const contentLength = headers['content-length'] ? Number(headers['content-length']) : null
      if (contentLength != null && !Number.isFinite(contentLength)) {
        this.#headersSent = true
        return this.#handler.onHeaders(statusCode, rawHeaders, resume, statusMessage)
      }

      if (statusCode === 206) {
        const range = parseRangeHeader(headers['content-range'])
        if (!range) {
          this.#headersSent = true
          return this.#handler.onHeaders(statusCode, rawHeaders, resume, statusMessage)
        }

        const { start, size, end = size } = range

        assert(start != null && Number.isFinite(start), 'content-range mismatch')
        assert(end != null && Number.isFinite(end), 'invalid content-length')
        assert(contentLength == null || end == null || contentLength === end + 1 - start, 'content-range mismatch')

        this.#pos = start
        this.#end = end ?? contentLength
        this.#etag = headers.etag
      } else if (statusCode === 200) {
        this.#pos = 0
        this.#end = contentLength
        this.#etag = headers.etag
      } else {
        this.#headersSent = true
        return this.#handler.onHeaders(statusCode, rawHeaders, resume, statusMessage)
      }

      assert(Number.isFinite(this.#pos))
      assert(this.#end == null || Number.isFinite(this.#end))

      return this.#handler.onHeaders(statusCode, rawHeaders, resume, statusMessage)
    } else if (statusCode === 206 || (this.#pos === 0 && statusCode === 200)) {
      const etag = headers.etag
      if (this.#etag != null && this.#etag !== etag) {
        throw this.#reason
      }

      const contentRange = parseRangeHeader(headers['content-range'])
      if (!contentRange) {
        throw this.#reason
      }

      const { start, size, end = size } = contentRange
      assert(this.#pos === start, 'content-range mismatch')
      assert(this.#end == null || this.#end === end, 'content-range mismatch')

      return true
    } else {
      throw this.#reason
    }
  }

  onData (chunk) {
    if (this.#pos != null) {
      this.#pos += chunk.length
    }

    return this.#handler.onData(chunk)
  }

  onError (err) {
    if (this.#aborted || isDisturbed(this.#opts.body)) {
      return this.#handler.onError(err)
    }

    this.#reason = err

    // We reconcile in case of a mix between network errors
    // and server error response
    if (this.#retryCount - this.#retryCountCheckpoint > 0) {
      // We count the difference between the last checkpoint and the current retry count
      this.#retryCount = this.#retryCountCheckpoint + (this.#retryCount - this.#retryCountCheckpoint)
    } else {
      this.#retryCount += 1
    }

    this.#retryOpts.retry(
      err,
      {
        state: { counter: this.#retryCount },
        opts: { retryOptions: this.#retryOpts, ...this.#opts }
      },
      (er) => {
        if (er != null) {
          this.#handler.onError(er)
        } else if (this.#aborted || isDisturbed(this.#opts.body)) {
          this.#handler.onError(err)
        } else {
          assert(Number.isFinite(this.#pos))
          assert(this.#end == null || Number.isFinite(this.#end))

          if (this.#pos > 0) {
            this.#opts = {
              ...this.#opts,
              headers: {
                ...this.#opts.headers,
                range: `bytes=${this.#pos}-${this.#end ?? ''}`
              }
            }
          }

          try {
            this.#retryCountCheckpoint = this.#retryCount
            this.#dispatch(this.#opts, this)
          } catch (err) {
            this.#handler.onError(err)
          }
        }
      }
    )
  }
}

function defaultRetry (err, { state, opts }, cb) {
  const { statusCode, code, headers } = err
  const { method, retryOptions } = opts
  const {
    maxRetries,
    minTimeout,
    maxTimeout,
    timeoutFactor,
    statusCodes,
    errorCodes,
    methods
  } = retryOptions
  const { counter } = state

  // Any code that is not a Undici's originated and allowed to retry
  if (
    code &&
    code !== 'UND_ERR_REQ_RETRY' &&
    !errorCodes.includes(code)
  ) {
    cb(err)
    return
  }

  // If a set of method are provided and the current method is not in the list
  if (Array.isArray(methods) && !methods.includes(method)) {
    cb(err)
    return
  }

  // If a set of status code are provided and the current status code is not in the list
  if (
    statusCode != null &&
    Array.isArray(statusCodes) &&
    !statusCodes.includes(statusCode)
  ) {
    cb(err)
    return
  }

  // If we reached the max number of retries
  if (counter > maxRetries) {
    cb(err)
    return
  }

  let retryAfterHeader = headers?.['retry-after']
  if (retryAfterHeader) {
    retryAfterHeader = Number(retryAfterHeader)
    retryAfterHeader = Number.isFinite(retryAfterHeader)
      ? retryAfterHeader * 1e3 // Retry-After is in seconds
      : new Date(retryAfterHeader).getTime() - Date.now()
  }

  const retryTimeout =
    retryAfterHeader > 0
      ? Math.min(retryAfterHeader, maxTimeout)
      : Math.min(minTimeout * timeoutFactor ** (counter - 1), maxTimeout)

  setTimeout(() => cb(null), retryTimeout)
}

module.exports = RetryHandler
