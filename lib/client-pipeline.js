'use strict'

const {
  Readable,
  Duplex,
  PassThrough
} = require('stream')
const {
  InvalidArgumentError,
  InvalidReturnValueError,
  RequestAbortedError
} = require('./core/errors')
const util = require('./core/util')
const { AsyncResource } = require('async_hooks')
const { assert } = require('console')
const { addSignal, removeSignal } = require('./abort-signal')

const kResume = Symbol('resume')

class PipelineRequest extends Readable {
  constructor () {
    super({ autoDestroy: true })

    this[kResume] = null
  }

  _read () {
    const { [kResume]: resume } = this

    if (resume) {
      this[kResume] = null
      resume()
    }
  }

  _destroy (err, callback) {
    this._read()

    assert(err || this._readableState.endEmitted)

    callback(err)
  }
}

class PipelineResponse extends Readable {
  constructor (resume) {
    super({ autoDestroy: true })
    this[kResume] = resume
  }

  _read () {
    this[kResume]()
  }

  _destroy (err, callback) {
    if (!err && !this._readableState.endEmitted) {
      err = new RequestAbortedError()
    }

    callback(err)
  }
}

class PipelineHandler extends AsyncResource {
  constructor (opts, handler) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (typeof handler !== 'function') {
      throw new InvalidArgumentError('invalid handler')
    }

    const { signal, method, opaque } = opts

    if (signal && typeof signal.on !== 'function' && typeof signal.addEventListener !== 'function') {
      throw new InvalidArgumentError('signal must be an EventEmitter or EventTarget')
    }

    if (method === 'CONNECT') {
      throw new InvalidArgumentError('invalid method')
    }

    super('UNDICI_PIPELINE')

    this.opaque = opaque || null
    this.handler = handler
    this.abort = null

    this.req = new PipelineRequest().on('error', util.nop)

    this.ret = new Duplex({
      readableObjectMode: opts.objectMode,
      autoDestroy: true,
      read: () => {
        const { body } = this

        if (body && body.resume) {
          body.resume()
        }
      },
      write: (chunk, encoding, callback) => {
        const { req } = this

        if (req.push(chunk, encoding) || req._readableState.destroyed) {
          callback()
        } else {
          req[kResume] = callback
        }
      },
      destroy: (err, callback) => {
        const { body, req, res, ret, abort } = this

        if (!err && !ret._readableState.endEmitted) {
          err = new RequestAbortedError()
        }

        if (abort && err) {
          abort()
        }

        util.destroy(body, err)
        util.destroy(req, err)
        util.destroy(res, err)

        removeSignal(this)

        callback(err)
      }
    }).on('prefinish', () => {
      const { req } = this

      // Node < 15 does not call _final in same tick.
      req.push(null)
    })

    this.res = null

    addSignal(this, signal)
  }

  onConnect (abort) {
    const { ret } = this

    if (ret.destroyed) {
      throw new RequestAbortedError()
    }

    this.abort = abort
  }

  onHeaders (statusCode, headers, resume) {
    const { opaque, handler } = this

    if (statusCode < 200) {
      return
    }

    this.res = new PipelineResponse(resume)

    let body
    try {
      this.handler = null
      body = this.runInAsyncScope(handler, null, {
        statusCode,
        headers: util.parseHeaders(headers),
        opaque,
        body: this.res
      })
    } catch (err) {
      this.res.on('error', util.nop)
      throw err
    }

    if (!body || typeof body.on !== 'function') {
      throw new InvalidReturnValueError('expected Readable')
    }

    body
      .on('data', (chunk) => {
        const { ret, body } = this

        if (!ret.push(chunk) && body.pause) {
          body.pause()
        }
      })
      .on('error', (err) => {
        const { ret } = this

        util.destroy(ret, err)
      })
      .on('end', () => {
        const { ret } = this

        ret.push(null)
      })
      .on('close', () => {
        const { ret } = this

        if (!ret._readableState.ended) {
          util.destroy(ret, new RequestAbortedError())
        }
      })

    this.body = body
  }

  onData (chunk) {
    const { res } = this
    return res.push(chunk)
  }

  onComplete (trailers) {
    const { res } = this
    res.push(null)
  }

  onError (err) {
    const { ret } = this
    this.handler = null
    util.destroy(ret, err)
  }
}

function pipeline (opts, handler) {
  try {
    const pipelineHandler = new PipelineHandler(opts, handler)
    const {
      path,
      method,
      headers,
      idempotent,
      servername,
      signal
    } = opts
    this.dispatch({
      path,
      method,
      body: pipelineHandler.req,
      headers,
      idempotent,
      servername,
      signal
    }, pipelineHandler)
    return pipelineHandler.ret
  } catch (err) {
    return new PassThrough().destroy(err)
  }
}

module.exports = pipeline
