const assert = require('node:assert')

const { kRetryHandlerDefaultRetry } = require('../core/symbols')
const { RequestRetryError } = require('../core/errors')
const {
  isDisturbed,
  parseHeaders,
  parseRangeHeader,
  safeHTTPMethods
} = require('../core/util')

function calculateRetryAfterHeader (retryAfter) {
  const current = Date.now()
  const diff = new Date(retryAfter).getTime() - current

  return diff
}

class RetryHandler {
  constructor (opts, handlers, retryOpts) {
    const {
      // Retry scoped
      retry: retryFn,
      max,
      maxTimeout,
      minTimeout,
      timeoutFactor,
      // Response scoped
      methods,
      idempotent,
      codes,
      retryAfter,
      status: statusCodes
    } = retryOpts ?? {}

    this.dispatch = handlers.dispatch
    this.handler = handlers.handler
    this.opts = opts
    this.abort = null
    this.aborted = false
    this.retryOpts = {
      retry: retryFn ?? RetryHandler[kRetryHandlerDefaultRetry],
      retryAfter: retryAfter ?? true,
      maxTimeout: maxTimeout ?? 30 * 1000, // 30s,
      timeout: minTimeout ?? 500, // .5s
      timeoutFactor: timeoutFactor ?? 2,
      max: max ?? 8,
      // What errors we should retry
      methods: methods ?? ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'TRACE'],
      // States weather or not retry on idempotent methods
      idempotent: idempotent ?? false,
      // Indicates which errors to retry
      status: statusCodes ?? [500, 502, 503, 504, 429],
      // List of errors to retry
      codes: codes ?? [
        'ECONNRESET',
        'ECONNREFUSED',
        'ENOTFOUND',
        'ENETDOWN',
        'ENETUNREACH',
        'EHOSTDOWN',
        'EHOSTUNREACH',
        'EPIPE'
      ]
    }

    // TODO: hidde behind a symbol
    this.count = 0
    this.timeout = null
    this.retryAfter = null
    this.head = 0
    this.tail = null
    this.etag = null
    this.resume = null

    // Handle possible onConnect duplication
    this.handler.onConnect(reason => {
      this.aborted = true
      if (this.abort) {
        this.abort(reason)
      } else {
        this.reason = reason
      }
    })
  }

  onConnect (abort) {
    if (this.aborted) {
      abort(this.reason)
    } else {
      this.abort = abort
    }
  }

  onBodySent (chunk) {
    return this.handler.onBodySent(chunk)
  }

  static [kRetryHandlerDefaultRetry] (err, { counter, currentTimeout }, opts) {
    const { statusCode, code, headers } = err
    const { method } = opts
    const {
      max,
      timeout,
      maxTimeout,
      timeoutFactor,
      status,
      idempotent,
      codes,
      methods
    } = opts.retry

    currentTimeout =
      currentTimeout != null && currentTimeout > 0 ? currentTimeout : timeout

    // Any code that is not a Undici's originated and allowed to retry
    if (
      code &&
      code !== 'UND_ERR_REQ_RETRY' &&
      code !== 'UND_ERR_SOCKET' &&
      !codes.includes(code)
    ) {
      return null
    }

    // If idempotent is set and the method is not in the safe list
    if (idempotent && !safeHTTPMethods.includes(method)) return null

    // If a set of method are provided and the current method is not in the list
    if (Array.isArray(methods) && !methods.includes(method)) return null

    // If a set of status code are provided and the current status code is not in the list
    if (
      statusCode != null &&
      Array.isArray(status) &&
      !status.includes(statusCode)
    ) {
      return null
    }

    // If we reached the max number of retries
    if (counter > max) return null

    let retryAfterHeader = headers != null && headers['retry-after']
    if (retryAfterHeader) {
      retryAfterHeader = Number(retryAfterHeader)
      retryAfterHeader = isNaN(retryAfterHeader)
        ? calculateRetryAfterHeader(retryAfterHeader)
        : retryAfterHeader * 1e3 // Retry-After is in seconds
    }

    const retryTimeout =
      retryAfterHeader > 0
        ? Math.min(retryAfterHeader, maxTimeout)
        : Math.min(currentTimeout * timeoutFactor ** counter, maxTimeout)

    return retryTimeout
  }

  onHeaders (statusCode, rawHeaders, resume, statusMessage) {
    const headers = parseHeaders(rawHeaders)
    const err = new RequestRetryError(
      'Request failed after retry',
      statusCode,
      {
        headers,
        count: this.count
      }
    )

    this.count += 1

    if (statusCode > 299) {
      this.abort(err)
      return false
    }

    // Checkpoint for resume from where we left it
    if (this.resume != null) {
      this.resume = null

      if (statusCode !== 206) {
        return true
      }

      const contentRange = parseRangeHeader(headers['content-range'])
      if (
        // Let's start with a weak etag check
        (this.etag != null && this.etag !== headers.etag) ||
        // If no content range
        !contentRange
      ) {
        this.abort(err)
        return false
      }

      const { start, size, end = size } = contentRange

      assert(this.head === start, 'content-range mismatch')
      assert(this.tail == null || this.tail === end, 'content-range mismatch')

      this.resume = resume
      return true
    }

    if (this.tail == null) {
      if (statusCode === 206) {
        // First time we receive 206
        const range = parseRangeHeader(headers['content-range'])

        if (range == null) {
          return this.handler.onHeaders(
            statusCode,
            rawHeaders,
            resume,
            statusMessage
          )
        }

        const { start, size, end = size } = range

        assert(
          start != null && Number.isFinite(start) && this.head !== start,
          'content-range mismatch'
        )
        assert(Number.isFinite(start))
        assert(
          end != null && Number.isFinite(end) && this.tail !== end,
          'invalid content-length'
        )

        this.head = start
        this.tail = end
      }

      // We make our best to checkpoint the body for further range headers
      if (this.tail == null) {
        const contentLength = headers['content-length']
        this.tail = contentLength != null ? Number(contentLength) : null
      }

      assert(Number.isFinite(this.head))
      assert(
        this.tail == null || Number.isFinite(this.tail),
        'invalid content-length'
      )

      this.resume = resume
      this.etag = headers.etag != null ? headers.etag : null

      return this.handler.onHeaders(
        statusCode,
        rawHeaders,
        resume,
        statusMessage
      )
    }

    // Meant to just indicate weather or not trigger a retry
    // It should return null to indicate we exhausted the retries
    const retryAfter = this.retryOpts.retry(
      err,
      { counter: this.count, currentTimeout: this.retryAfter },
      { retry: this.retryOpts, ...this.opts }
    )

    if (retryAfter == null) {
      return this.handler.onHeaders(
        statusCode,
        rawHeaders,
        resume,
        statusMessage
      )
    }

    assert(Number.isFinite(retryAfter), 'invalid retryAfter')

    this.retryAfter = retryAfter

    this.abort(err)

    return false
  }

  onData (chunk) {
    this.head += chunk.length

    return this.handler.onData(chunk)
  }

  onComplete (rawTrailers) {
    this.count = 0
    return this.handler.onComplete(rawTrailers)
  }

  onError (err) {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
      this.retryAfter = null
    }

    const retryAfter = this.retryOpts.retry(
      err,
      { counter: this.count++, currentTimeout: this.retryAfter },
      { retry: this.retryOpts, ...this.opts }
    )

    assert(
      retryAfter == null || Number.isFinite(retryAfter),
      'invalid retryAfter'
    )

    this.retryAfter = retryAfter

    if (
      this.retryAfter == null ||
      this.aborted ||
      isDisturbed(this.opts.body)
    ) {
      return this.handler.onError(err)
    }

    if (this.head !== 0) {
      this.opts = {
        ...this.opts,
        headers: {
          ...this.opts.headers,
          range: `bytes=${this.head}-${this.tail ?? ''}`
        }
      }
    }

    this.timeout = setTimeout(() => {
      this.timeout = null
      this.retryAfter = null

      try {
        this.dispatch(this.opts, this)
      } catch (err) {
        this.handler.onError(err)
      }
    }, this.retryAfter)
  }
}

module.exports = RetryHandler
