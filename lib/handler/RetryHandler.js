const assert = require('node:assert')

const { RequestRetryError } = require('../core/errors')
const { isDisturbed, parseHeaders } = require('../core/util')

function parseRange (range) {
  if (range == null || range === '') return { start: 0, end: null }

  const m = range ? range.match(/^bytes=(\d+)-(\d+)?$/) : null
  return m ? { start: parseInt(m[1]), end: m[2] ? parseInt(m[2]) : null } : null
}

class RetryHandler {
  constructor (opts, handlers, retryOpts) {
    const {
      retry: retryFn,
      // Retry scoped
      max,
      maxTimeout,
      minTimeout,
      timeoutFactor,
      // Response scoped
      methods,
      idempotent,
      codes,
      status: statusCode
    } = retryOpts ?? {}

    this.dispatch = handlers.dispatch
    this.handler = handlers.handler
    this.opts = opts
    this.abort = null
    this.aborted = false
    this.retryOpts = {
      retry: retryFn ?? this.retry,
      maxTimeout: maxTimeout ?? 30 * 1000, // 30s,
      timeout: minTimeout ?? 500, // 1s
      timeoutFactor: timeoutFactor ?? 2,
      max: max ?? 8,
      // Indicates weather or not retry on methods
      // Takes prevalence over idempotent
      methods: methods ?? [
        'GET',
        'HEAD',
        'OPTIONS',
        'PUT',
        'DELETE',
        'TRACE',
        'PATCH'
      ],
      // States weather or not retry on idempotent methods
      idempotent: idempotent ?? true,
      // Works as block list if status is not provided
      status: statusCode ?? [420, 429, 502, 503, 504],
      // List of errors to not retry
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
    this.range = opts.method === 'GET' ? parseRange(opts.headers?.range) : null
  }

  onConnect (abort) {
    this.abort = abort
    return this.handler.onConnect(reason => {
      this.aborted = true
      this.abort(reason)
    })
  }

  onBodySent (chunk) {
    return this.handler.onBodySent(chunk)
  }

  //   TODO: hidde behind a symbol
  retry (_err, { counter, currentTimeout }, opts) {
    const { max, maxTimeout, timeoutFactor } = opts.retry

    if (counter > max) return null

    const retryTimeout = Math.min(
      currentTimeout * timeoutFactor ** counter,
      maxTimeout
    )

    return retryTimeout
  }

  onHeaders (statusCode, rawHeaders, resume, statusMessage) {
    if (statusCode < 400 || this.opts.retry.status.includes(statusCode)) {
      return this.handler.onHeaders(
        statusCode,
        rawHeaders,
        resume,
        statusMessage
      )
    }

    this.count++

    const err = new RequestRetryError(
      'Request failed after retry',
      statusCode,
      {
        headers: parseHeaders(rawHeaders),
        count: this.count
      }
    )

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

    console.log(retryAfter)
    assert(Number.isFinite(retryAfter), 'invalid retryAfter')

    this.retryAfter = retryAfter

    this.abort(err)

    return false
  }

  onData (chunk) {
    return this.handler.onData(chunk)
  }

  onComplete (rawTrailers) {
    return this.handler.onComplete(rawTrailers)
  }

  onError (err) {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }

    // TODO: encapsulate
    if (err.constructor !== RequestRetryError) {
      const retryAfter = this.retryOpts.retry(
        err,
        { counter: this.count, currentTimeout: this.retryAfter },
        { retry: this.retryOpts, ...this.opts }
      )

      assert(Number.isFinite(retryAfter), 'invalid retryAfter')

      this.retryAfter = retryAfter
    }

    if (
      this.retryAfter == null ||
      this.aborted ||
      isDisturbed(this.opts.body)
    ) {
      return this.handler.onError(err)
    }

    this.timeout = setTimeout(() => {
      this.timeout = null
      try {
        this.dispatch(this.opts, this)
      } catch (err) {
        this.handler.onError(err)
      }
    }, this.retryAfter)
  }
}

module.exports = RetryHandler
