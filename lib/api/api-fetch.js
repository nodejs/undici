// https://github.com/Ethan-Arrowood/undici-fetch

'use strict'

const Headers = require('./headers')
const { kHeadersList } = require('../core/symbols')
const { Readable } = require('stream')
const { METHODS, STATUS_CODES } = require('http')
const {
  InvalidArgumentError,
  NotSupportedError,
  RequestAbortedError
} = require('../core/errors')
const util = require('../core/util')
const { AsyncResource } = require('async_hooks')
const { addSignal, removeSignal } = require('./abort-signal')
const { isBlob, Blob } = require('buffer')

const kType = Symbol('type')
const kStatus = Symbol('status')
const kStatusText = Symbol('status text')
const kUrlList = Symbol('url list')
const kHeaders = Symbol('headers')
const kBody = Symbol('body')

let ReadableStream
let TransformStream

class Response {
  constructor ({
    type,
    url,
    body,
    statusCode,
    headers,
    context
  }) {
    this[kType] = type || 'default'
    this[kStatus] = statusCode || 0
    this[kStatusText] = STATUS_CODES[statusCode] || ''
    this[kUrlList] = Array.isArray(url) ? url : (url ? [url] : [])
    this[kHeaders] = headers || new Headers()
    this[kBody] = body || null

    if (context && context.history) {
      this[kUrlList].push(...context.history)
    }
  }

  get type () {
    return this[kType]
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
    return this[kStatusText]
  }

  get headers () {
    return this[kHeaders]
  }

  async blob () {
    const chunks = []
    if (this.body) {
      if (this.bodyUsed || this.body.locked) {
        throw new TypeError('unusable')
      }

      for await (const chunk of this.body) {
        chunks.push(chunk)
      }
    }
    return new Blob(chunks)
  }

  async arrayBuffer () {
    const blob = await this.blob()
    return await blob.arrayBuffer()
  }

  async text () {
    const blob = await this.blob()
    return await blob.text()
  }

  async json () {
    return JSON.parse(await this.text())
  }

  async formData () {
    // TODO: Implement.
    throw new NotSupportedError('formData')
  }

  get body () {
    return this[kBody]
  }

  get bodyUsed () {
    return util.isDisturbed(this.body)
  }

  clone () {
    let body = null

    if (this[kBody]) {
      if (util.isDisturbed(this[kBody])) {
        throw new TypeError('disturbed')
      }

      if (this[kBody].locked) {
        throw new TypeError('locked')
      }

      // https://fetch.spec.whatwg.org/#concept-body-clone
      const [out1, out2] = this[kBody].tee()

      this[kBody] = out1
      body = out2
    }

    return new Response({
      type: this[kType],
      statusCode: this[kStatus],
      url: this[kUrlList],
      headers: this[kHeaders],
      body
    })
  }
}

class FetchHandler extends AsyncResource {
  constructor (opts, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    const { signal, method, opaque } = opts

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

    this.opaque = opaque || null
    this.callback = callback
    this.controller = null

    this.abort = null
    this.context = null
    this.redirect = opts.redirect || 'follow'
    this.url = new URL(opts.path, opts.origin)

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

    let response
    if (headers.has('location')) {
      if (this.redirect === 'manual') {
        response = new Response({
          type: 'opaqueredirect',
          url: this.url
        })
      } else {
        response = new Response({
          type: 'error',
          url: this.url
        })
      }
    } else {
      const self = this
      if (!ReadableStream) {
        ReadableStream = require('stream/web').ReadableStream
      }
      response = new Response({
        type: 'default',
        url: this.url,
        body: new ReadableStream({
          async start (controller) {
            self.controller = controller
          },
          async pull () {
            resume()
            // TODO: Does this need to await something?
          },
          async cancel (reason) {
            abort()
            // TODO: Does this need to await something?
          }
        }, { highWaterMark: 16384 }),
        statusCode,
        headers,
        context
      })
    }

    this.callback = null

    this.runInAsyncScope(callback, null, null, response)

    return false
  }

  onData (chunk) {
    const { controller } = this

    // Copy the Buffer to detach it from Buffer pool.
    // TODO: Is this required?
    chunk = new Uint8Array(chunk)

    controller.enqueue(chunk)

    return controller.desiredSize > 0
  }

  onComplete (trailers) {
    const { controller } = this

    removeSignal(this)

    controller.close()
  }

  onError (err) {
    const { controller, callback, body, opaque } = this

    removeSignal(this)

    if (callback) {
      // TODO: Does this need queueMicrotask?
      this.callback = null
      queueMicrotask(() => {
        this.runInAsyncScope(callback, null, err, { opaque })
      })
    }

    if (controller) {
      this.controller = null
      // Ensure all queued handlers are invoked before destroying res.
      queueMicrotask(() => {
        controller.cancel(err)
      })
    }

    if (body) {
      this.body = null
      util.destroy(body, err)
    }
  }
}

function fetch (opts) {
  // TODO: Should we throw sync or async?

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

  if (opts.redirect != null) {
    // TODO: Validate
  } else {
    opts.redirect = 'follow'
  }

  if (opts.method != null) {
    opts.method = normalizeAndValidateRequestMethod(opts.method)
  } else {
    opts.method = 'GET'
  }

  if (opts.integrity) {
    // TODO: Implement
    throw new NotSupportedError()
  }

  if (opts.keepalive) {
    // Ignore
  }

  const headers = new Headers(opts.headers)

  if (!headers.has('accept')) {
    headers.set('accept', '*/*')
  }

  if (!headers.has('accept-language')) {
    headers.set('accept-language', '*')
  }

  const [body, contentType] = extractBody(opts.body)

  if (contentType && !headers.has('content-type')) {
    headers.set('content-type', contentType)
  }

  return new Promise((resolve, reject) => this.dispatch({
    path: opts.path,
    origin: opts.origin,
    method: opts.method,
    body: body ? (body.stream || body.source) : null,
    headers: headers[kHeadersList],
    maxRedirections: opts.redirect === 'follow' ? 20 : 0 // https://fetch.spec.whatwg.org/#concept-http-redirect-fetch
  }, new FetchHandler(opts, (err, res) => {
    if (err) {
      reject(err)
    } else {
      resolve(res)
    }
  })))
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

// https://fetch.spec.whatwg.org/#concept-bodyinit-extract
function extractBody (body) {
  // TODO: FormBody

  if (body == null) {
    return [null, null]
  } else if (body instanceof URLSearchParams) {
    // spec says to run application/x-www-form-urlencoded on body.list
    // this is implemented in Node.js as apart of an URLSearchParams instance toString method
    // See: https://github.com/nodejs/node/blob/e46c680bf2b211bbd52cf959ca17ee98c7f657f5/lib/internal/url.js#L490
    // and https://github.com/nodejs/node/blob/e46c680bf2b211bbd52cf959ca17ee98c7f657f5/lib/internal/url.js#L1100
    return [{
      source: body.toString()
    }, 'application/x-www-form-urlencoded;charset=UTF-8']
  } else if (typeof body === 'string') {
    return [{
      source: body
    }, 'text/plain;charset=UTF-8']
  } else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return [{
      source: body
    }, null]
  } else if (isBlob && isBlob(body)) {
    return [{
      source: body,
      length: body.size
    }, body.type || null]
  } else if (util.isStream(body) || typeof body.pipeThrough === 'function') {
    if (util.isDisturbed(body)) {
      throw new TypeError('disturbed')
    }

    let stream
    if (util.isStream(body)) {
      stream = Readable.toWeb(body)
    } else {
      if (body.locked) {
        throw new TypeError('locked')
      }

      if (!TransformStream) {
        TransformStream = require('stream/web').TransformStream
      }

      // https://streams.spec.whatwg.org/#readablestream-create-a-proxy
      const identityTransform = new TransformStream()
      body.pipeThrough(identityTransform)
      stream = identityTransform
    }

    return [{
      stream
    }, null]
  } else {
    throw Error('Cannot extract Body from input: ', body)
  }
}

module.exports = fetch
