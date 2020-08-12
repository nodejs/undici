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
} = require('./errors')
const util = require('./util')
const { AsyncResource } = require('async_hooks')

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

    if (!err && !this._readableState.endEmitted) {
      // This can happen if the server doesn't care
      // about the entire request body.
    }

    callback(err)
  }
}

class PipelineResponse extends Readable {
  constructor (resume) {
    super({ autoDestroy: true, read: resume })
  }

  _destroy (err, callback) {
    this._read()

    if (!err && !this._readableState.endEmitted) {
      err = new RequestAbortedError()
    }

    callback(err)
  }
}

class PipelineHandler extends AsyncResource {
  constructor (opts, handler) {
    super('UNDICI_PIPELINE')

    this.opaque = opts.opaque || null
    this.handler = handler

    this.req = new PipelineRequest()

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
        const { body, req, res, ret } = this

        if (!err && !ret._readableState.endEmitted) {
          err = new RequestAbortedError()
        }

        util.destroy(body, err)
        util.destroy(req, err)
        util.destroy(res, err)

        callback(err)
      }
    }).on('prefinish', () => {
      const { req } = this

      // Node < 15 does not call _final in same tick.
      req.push(null)
    })

    this.res = null
  }

  onHeaders (statusCode, headers, resume) {
    const { opaque, handler, ret } = this

    if (statusCode < 200) {
      return
    }

    this.res = new PipelineResponse(resume)

    let body
    try {
      this.handler = null
      body = this.runInAsyncScope(handler, null, {
        statusCode,
        headers,
        opaque,
        body: this.res
      })
    } catch (err) {
      this.res.on('error', util.nop)
      util.destroy(ret, err)
      return
    }

    if (
      !body ||
      typeof body.on !== 'function'
    ) {
      util.destroy(ret, new InvalidReturnValueError('expected Readable'))
      return
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

    if (res._readableState.destroyed) {
      return
    }

    return res.push(chunk)
  }

  onComplete (trailers) {
    const { res } = this

    if (res._readableState.destroyed) {
      return
    }

    res.push(null)
  }

  onError (err) {
    const { ret } = this

    this.handler = null

    util.destroy(ret, err)
  }
}

module.exports = function (client, opts, handler) {
  try {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (typeof handler !== 'function') {
      throw new InvalidArgumentError('invalid handler')
    }

    if (opts.method === 'CONNECT') {
      throw new InvalidArgumentError('invalid method')
    }

    const pipeline = new PipelineHandler(opts, handler)

    const {
      path,
      method,
      headers,
      idempotent,
      servername,
      signal,
      requestTimeout
    } = opts

    client.dispatch({
      path,
      method,
      body: pipeline.req,
      headers,
      idempotent,
      servername,
      signal,
      requestTimeout
    }, pipeline)

    return pipeline.ret
  } catch (err) {
    return new PassThrough().destroy(err)
  }
}
