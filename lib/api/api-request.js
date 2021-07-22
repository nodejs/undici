'use strict'

const { Readable, Duplex } = require('stream')
const {
  InvalidArgumentError,
  RequestAbortedError
} = require('../core/errors')
const { Blob } = require('buffer')
const util = require('../core/util')
const { AsyncResource } = require('async_hooks')
const { addSignal, removeSignal } = require('./abort-signal')
const assert = require('assert')

const kAbort = Symbol('abort')
const kResume = Symbol('resume')
const kError = Symbol('error')
const kChunk = Symbol('chunk')
const kDestroy = Symbol('destroy')
const kPush = Symbol('push')
const kBody = Symbol('body')

class BodyDuplex extends Duplex {
  constructor (options) {
    super({ autoDestroy: true, ...options })

    // https://github.com/nodejs/node/pull/34385

    if (options?.readable === false) {
      this._readableState.readable = false
      this._readableState.ended = true
      this._readableState.endEmitted = true
    }

    if (options?.writable === false) {
      this._writableState.writable = false
      this._writableState.ending = true
      this._writableState.ended = true
      this._writableState.finished = true
    }
  }
}

class RequestNodeReadable extends BodyDuplex {
  constructor (resume, abort) {
    super({ read: resume, writable: false })
    this[kAbort] = abort
  }

  _destroy (err, callback) {
    if (!err && !this._readableState.endEmitted) {
      err = new RequestAbortedError()
    }

    if (err) {
      this[kAbort]()
    }

    callback(err)
  }
}

class Body {
  constructor (resume, abort) {
    this[kAbort] = abort
    this[kResume] = resume
    this[kBody] = null
    this[kChunk] = null
    this[kError] = undefined
  }

  [kPush] (chunk) {
    if (!this[kBody]) {
      assert(!this[kChunk])
      this[kChunk] = chunk
      return false
    }

    if (chunk === null) {
      this[kError] = null
    }

    return this[kBody].push(chunk)
  }

  [kDestroy] (err) {
    if (!err && this[kError] === undefined) {
      err = new RequestAbortedError()
    }

    this[kError] = null

    if (this[kBody]) {
      this[kBody].destroy(err)
    } else {
      this[kError] = err
    }
  }

  readableNodeStream () {
    return this.nodeStream()
  }

  writableNodeStream () {
    // TODO
  }

  nodeStream () {
    if (this[kBody]) {
      throw new Error('readable consumed') // TODO: Proper error.
    }

    this[kBody] = new RequestNodeReadable(this[kResume], this[kAbort])

    if (this[kChunk]) {
      this[kBody].push(this[kChunk])
      this[kChunk] = null
    }

    if (this[kError] !== undefined) {
      util.destroy(this[kBody], this[kError])
    }

    return this[kBody]
  }

  readableWebStream () {
    if (!Readable.prototype.asWeb) {
      throw new Error('not supported') // TODO: Proper error.
    }

    // TODO: Optimize.
    return this.readableNodeStream().asWeb()
  }

  writableWebStream () {
    // TODO
  }

  async blob () {
    if (!Blob) {
      throw new Error('not supported') // TODO: Proper error.
    }

    // TODO: Optimize.
    const sources = []
    for await (const chunk of this.readableNodeStream()) {
      // TOOD: max size?
      sources.push(chunk)
    }
    return new Blob(sources)
  }

  async buffer () {
    // TODO: Optimize.
    const sources = []
    for await (const chunk of this.readableNodeStream()) {
      // TOOD: max size?
      sources.push(chunk)
    }
    return Buffer.concat(sources)
  }

  async arrayBuffer () {
    // TODO: Optimize.
    const blob = await this.blob()
    return await blob.arrayBuffer()
  }

  * [Symbol.asyncIterator] () {
    // TODO: Optimize.
    yield * this.readableNodeStream()
  }

  async text () {
    // TODO: Optimize.
    // TODO: Validate content-type req & res headers?
    let ret = ''
    for await (const chunk of this.readableNodeStream()) {
      // TOOD: max size?
      ret += chunk
    }
    return ret
  }

  async json () {
    // TODO: Optimize.
    // TODO: Validate content-type req & res headers?
    return JSON.parse(await this.text())
  }
}

class RequestHandler extends AsyncResource {
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
      return
    }

    const body = new Body(resume, abort)

    this.callback = null
    this.res = body

    this.runInAsyncScope(callback, null, null, {
      statusCode,
      headers: util.parseHeaders(headers),
      trailers: this.trailers,
      opaque,
      body,
      context
    })
  }

  onData (chunk) {
    const { res } = this
    return res[kPush](chunk)
  }

  onComplete (trailers) {
    const { res } = this

    removeSignal(this)

    util.parseHeaders(trailers, this.trailers)

    res[kPush](null)
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
        res[kDestroy](err)
      })
    }

    if (body) {
      this.body = null
      util.destroy(this.body, err)
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
