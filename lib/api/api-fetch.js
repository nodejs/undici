// https://github.com/Ethan-Arrowood/undici-fetch

'use strict'

const Body = require('./readable')
const Headers = require('./headers')
const { kHeadersList } = require('../core/symbols')
const { METHODS } = require('http')
const {
  InvalidArgumentError,
  NotSupportedError,
  RequestAbortedError
} = require('../core/errors')
const util = require('../core/util')
const { AsyncResource } = require('async_hooks')
const { addSignal, removeSignal } = require('./abort-signal')
const { isBlob } = require('buffer')
const assert = require('assert')

const kStatus = Symbol('status')
const kUrlList = Symbol('url list')
const kHeaders = Symbol('headers')

class Response extends Body {
  constructor ({
    url,
    resume,
    abort,
    statusCode,
    headers,
    context
  }) {
    super(resume, abort)

    this[kStatus] = statusCode
    this[kUrlList] = [url]
    this[kHeaders] = headers

    if (context && context.history) {
      this[kUrlList].push(...context.history)
    }
  }

  get type () {
    return 'default'
  }

  get url () {
    const length = this[kUrlList].length
    return length === 0 ? '' : this[kUrlList][length - 1].toString()
  }

  get redirected () {
    return this[kUrlList].length > 1
  }

  get status () {
    return this[kStatus]
  }

  get ok () {
    return this[kStatus] >= 200 && this[kStatus] <= 299
  }

  get statusText () {
    // TODO: Implement
    return ''
  }

  get headers () {
    return this[kHeaders]
  }

  clone () {
    if (this.bodyUsed) {
      throw TypeError('Cannot clone Response - body is unusable')
    }

    // TODO: Implement.
    throw new NotSupportedError()
  }
}

// TODO: https://fetch.spec.whatwg.org/#concept-http-redirect-fetch
class FetchHandler extends AsyncResource {
  constructor (opts, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    const { signal, method, opaque, body } = opts

    try {
      if (typeof callback !== 'function') {
        throw new InvalidArgumentError('invalid callback')
      }

      if (signal && typeof signal.on !== 'function' && typeof signal.addEventListener !== 'function') {
        throw new InvalidArgumentError('signal must be an EventEmitter or EventTarget')
      }

      if (method === 'CONNECT') {
        throw new InvalidArgumentError('invalid method')
      }

      super('UNDICI_FETCH')
    } catch (err) {
      if (util.isStream(body)) {
        util.destroy(body.on('error', util.nop), err)
      }
      throw err
    }

    this.opaque = opaque || null
    this.callback = callback
    this.res = null
    this.abort = null
    this.body = body
    this.context = null
    this.redirect = opts.redirect || 'follow'
    this.url = new URL(opts.path, opts.origin)

    if (util.isStream(body)) {
      body.on('error', (err) => {
        this.onError(err)
      })
    }

    addSignal(this, signal)
  }

  onConnect (abort, context) {
    if (!this.callback) {
      throw new RequestAbortedError()
    }

    this.abort = abort
    this.context = context
  }

  onHeaders (statusCode, headers, resume) {
    const { callback, abort, context } = this

    if (statusCode < 200) {
      return
    }

    headers = new Headers(headers)

    if (this.redirect === 'follow' && headers.get('location')) {
      // TODO: network error
    }

    const body = new Response({
      url: this.url,
      resume,
      abort,
      statusCode,
      headers,
      context
    })

    this.callback = null
    this.res = body

    this.runInAsyncScope(callback, null, null, body)
  }

  onData (chunk) {
    const { res } = this
    return res.push(chunk)
  }

  onComplete (trailers) {
    const { res } = this

    removeSignal(this)

    res.push(null)
  }

  onError (err) {
    const { res, callback, body, opaque } = this

    removeSignal(this)

    if (callback) {
      // TODO: Does this need queueMicrotask?
      this.callback = null
      queueMicrotask(() => {
        this.runInAsyncScope(callback, null, err, { opaque })
      })
    }

    if (res) {
      this.res = null
      // Ensure all queued handlers are invoked before destroying res.
      queueMicrotask(() => {
        util.destroy(res, err)
      })
    }

    if (body) {
      this.body = null
      util.destroy(body, err)
    }
  }
}

function fetch (opts, callback) {
  if (callback === undefined) {
    return new Promise((resolve, reject) => {
      fetch.call(this, opts, (err, data) => {
        return err ? reject(err) : resolve(data)
      })
    })
  }

  try {
    if (opts.referrer) {
      // TODO: Implement
      throw new NotSupportedError()
    }

    if (opts.referrerPolicy) {
      // TODO: Implement
      throw new NotSupportedError()
    }

    if (opts.mode) {
      // TODO: Implement
      throw new NotSupportedError()
    }

    if (opts.credentials) {
      // TODO: Implement
      throw new NotSupportedError()
    }

    if (opts.cache) {
      // TODO: Implement
      throw new NotSupportedError()
    }

    if (opts.redirect !== undefined && opts.redirect !== 'follow') {
      // TODO: Implement
      throw new NotSupportedError()
    }

    if (opts.integrity) {
      // TODO: Implement
      throw new NotSupportedError()
    }

    const headers = new Headers(opts.headers)

    if (!headers.has('accept')) {
      headers.set('accept', '*/*')
    }

    if (!headers.has('accept-language')) {
      headers.set('accept-language', '*')
    }

    const [body, contentType] = extractBody(opts.body, opts.keepalive)

    if (contentType) {
      // TODO: Should this also check `!headers.has('content-type')`?
      headers.set('content-type', contentType)
    }

    this.dispatch({
      path: opts.path,
      origin: opts.origin,
      method: normalizeAndValidateRequestMethod(opts.method || 'GET'),
      body,
      headers: headers ? (headers[kHeadersList] || headers) : null,
      maxRedirections: 20 // https://fetch.spec.whatwg.org/#concept-http-redirect-fetch
    }, new FetchHandler(opts, callback))
  } catch (err) {
    if (typeof callback !== 'function') {
      throw err
    }
    const opaque = opts && opts.opaque
    queueMicrotask(() => callback(err, { opaque }))
  }
}

function normalizeAndValidateRequestMethod (method) {
  if (typeof method !== 'string') {
    throw TypeError(`Request method: ${method} must be type 'string'`)
  }

  const normalizedMethod = method.toUpperCase()

  if (METHODS.indexOf(normalizedMethod) === -1) {
    throw Error(`Normalized request method: ${normalizedMethod} must be one of ${METHODS.join(', ')}`)
  }

  return normalizedMethod
}

function extractBody (body, keepalive = false) {
  // TODO: FormBody

  if (body == null) {
    return [null, null]
  } else if (body instanceof URLSearchParams) {
    // spec says to run application/x-www-form-urlencoded on body.list
    // this is implemented in Node.js as apart of an URLSearchParams instance toString method
    // See: https://github.com/nodejs/node/blob/e46c680bf2b211bbd52cf959ca17ee98c7f657f5/lib/internal/url.js#L490
    // And: https://github.com/nodejs/node/blob/e46c680bf2b211bbd52cf959ca17ee98c7f657f5/lib/internal/url.js#L1100
    return [body.toString(), 'application/x-www-form-urlencoded;charset=UTF-8']
  } else if (typeof body === 'string') {
    return [body, 'text/plain;charset=UTF-8']
  } else if (ArrayBuffer.isView(body)) {
    return [body, null]
  } else if (isBlob && isBlob(body)) {
    return [body, null]
  } else if (
    typeof body.pipe === 'function' || // node Readable
    typeof body.pipeTo === 'function' // web ReadableStream
  ) {
    if (isLocked(body)) {
      // TODO: Standard says "Assert" but is unclear regarding what that means?
      assert(false, 'locked')
    }

    if (isDisturbed(body)) {
      // TODO: Standard says "Assert" but is unclear regarding what that means?
      assert(false, 'disturbed')
    }

    if (keepalive) {
      throw new TypeError('Cannot extract body while keepalive is true')
    }

    return [body, null]
  } else {
    throw Error('Cannot extract Body from input: ', body)
  }
}

function isLocked (body) {
  return body.locked
}

function isDisturbed (body) {
  const state = body._readableState
  return (
    body.bodyUsed ||
    body.readableDidRead ||
    body.destroyed ||
    (state && state.endEmitted)
  )
}

module.exports = fetch
