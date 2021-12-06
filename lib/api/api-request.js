'use strict'

const Readable = require('./readable')
const {
  InvalidArgumentError,
  RequestAbortedError
} = require('../core/errors')
const util = require('../core/util')
const { AsyncResource } = require('async_hooks')
const { addSignal, removeSignal } = require('./abort-signal')

class Response {
  constructor({
    statusCode,
    headers,
    trailers,
    opaque,
    body,
    context
  }) {
    this.statusCode = statusCode
    this.headers = headers
    this.trailers = trailers
    this.opaque = opaque
    this.body = body
    this.context = context
  }

  get status () {
    return this.statusCode
  }

  get ok () {
    return this.status >= 200 && this.status < 300
  }

  text () {
    return this.body.text()
  }

  json () {
    return this.body.json()
  }

  blob () {
    return this.body.blob()
  }

  arrayBuffer () {
    return this.body.arrayBuffer()
  }

  formData () {
    return this.body.formData()
  }

  get bodyUsed () {
    return this.body.bodyUsed
  }

  // get body () {
  //   return this.body.body
  // }

  dump(opts) {
    return this.body.dump(opts)
  }
}

class RequestHandler extends AsyncResource {
  constructor (opts, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    const { signal, method, opaque, body, onInfo } = opts

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

      if (onInfo && typeof onInfo !== 'function') {
        throw new InvalidArgumentError('invalid onInfo callback')
      }

      super('UNDICI_REQUEST')
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
    this.trailers = {}
    this.context = null
    this.onInfo = onInfo || null

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
    const { callback, opaque, abort, context } = this

    if (statusCode < 200) {
      if (this.onInfo) {
        this.onInfo({ statusCode, headers: util.parseHeaders(headers) })
      }
      return
    }

    const parsedHeaders = util.parseHeaders(headers)
    const body = new Readable(resume, abort, parsedHeaders['content-type'])

    this.callback = null
    this.res = body

    this.runInAsyncScope(callback, null, null, new Response({
      statusCode,
      headers: parsedHeaders,
      trailers: this.trailers,
      opaque,
      body,
      context
    }))
  }

  onData (chunk) {
    const { res } = this
    return res.push(chunk)
  }

  onComplete (trailers) {
    const { res } = this

    removeSignal(this)

    util.parseHeaders(trailers, this.trailers)

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

function request (opts, callback) {
  if (callback === undefined) {
    return new Promise((resolve, reject) => {
      request.call(this, opts, (err, data) => {
        return err ? reject(err) : resolve(data)
      })
    })
  }

  try {
    this.dispatch(opts, new RequestHandler(opts, callback))
  } catch (err) {
    if (typeof callback !== 'function') {
      throw err
    }
    const opaque = opts && opts.opaque
    queueMicrotask(() => callback(err, { opaque }))
  }
}

module.exports = request
