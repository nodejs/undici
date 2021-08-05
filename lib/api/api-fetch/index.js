// https://github.com/Ethan-Arrowood/undici-fetch

'use strict'

const Headers = require('./headers')
const { kHeadersList } = require('../../core/symbols')
const { METHODS } = require('http')
const Response = require('./response')
const {
  InvalidArgumentError,
  NotSupportedError,
  RequestAbortedError
} = require('../../core/errors')
const { addSignal, removeSignal } = require('../abort-signal')
const { extractBody } = require('./body')

let ReadableStream

class FetchHandler {
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
          },
          async cancel (reason) {
            let err
            if (reason instanceof Error) {
              err = reason
            } else if (typeof reason === 'string') {
              err = new Error(reason)
            } else {
              err = new RequestAbortedError()
            }
            abort(err)
          }
        }, { highWaterMark: 16384 }),
        statusCode,
        headers,
        context
      })
    }

    this.callback = null
    callback(null, response)

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

  onComplete () {
    const { controller } = this

    removeSignal(this)

    controller.close()
  }

  onError (err) {
    const { controller, callback } = this

    removeSignal(this)

    if (callback) {
      this.callback = null
      callback(err)
    }

    if (controller) {
      this.controller = null
      controller.error(err)
    }
  }
}

async function fetch (opts) {
  if (opts.referrer != null) {
    // TODO: Implement?
    throw new NotSupportedError()
  }

  if (opts.referrerPolicy != null) {
    // TODO: Implement?
    throw new NotSupportedError()
  }

  if (opts.mode != null) {
    // TODO: Implement?
    throw new NotSupportedError()
  }

  if (opts.credentials != null) {
    // TODO: Implement?
    throw new NotSupportedError()
  }

  if (opts.cache != null) {
    // TODO: Implement?
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

  if (opts.integrity != null) {
    // TODO: Implement?
    throw new NotSupportedError()
  }

  if (opts.keepalive != null) {
    // TODO: Validate
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

module.exports = fetch
