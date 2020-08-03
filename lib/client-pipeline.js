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

// TODO: Refactor

const kResume = Symbol('resume')

class PipelineHandler extends AsyncResource {
  constructor (opts, callback) {
    super('UNDICI_PIPELINE')

    this.opaque = opts.opaque
    this.controller = null
    this.callback = callback
    this.res = null
  }

  onConnect (controller) {
    this.controller = controller
  }

  onHeaders (statusCode, headers) {
    if (statusCode < 200) {
      return
    }

    const { callback, controller, opaque } = this

    this.callback = null
    this.res = this.runInAsyncScope(callback, this, null, {
      statusCode,
      headers,
      opaque: opaque,
      resume: controller.resume
    })
  }

  onData (chunk) {
    const { res, controller } = this

    if (!this.runInAsyncScope(res, null, null, chunk)) {
      controller.pause()
    }
  }

  onComplete (trailers) {
    const { res } = this

    this.runInAsyncScope(res, null, null, null)
  }

  onError (err) {
    const { callback, res } = this

    if (res) {
      this.res = null
      res(err, null)
    }

    if (callback) {
      this.callback = null
      this.runInAsyncScope(callback, null, err, null)
    }
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

    const req = new Readable({
      autoDestroy: true,
      read () {
        if (this[kResume]) {
          const resume = this[kResume]
          this[kResume] = null
          resume()
        }
      },
      destroy (err, callback) {
        this._read()

        if (err) {
          util.destroy(ret, err)
        } else if (!this._readableState.endEmitted) {
          // This can happen if the server doesn't care
          // about the entire request body.
          ret.end()
        }

        request.runInAsyncScope(callback, null, err, null)
      }
    })

    let res
    let body

    const ret = new Duplex({
      readableObjectMode: opts.objectMode,
      autoDestroy: true,
      read () {
        if (body && body.resume) {
          body.resume()
        }
      },
      write (chunk, encoding, callback) {
        if (req.destroyed || req.push(chunk, encoding)) {
          callback()
        } else {
          req[kResume] = callback
        }
      },
      destroy (err, callback) {
        if (!err && !this._readableState.endEmitted) {
          err = new RequestAbortedError()
        }
        util.destroy(body, err)
        util.destroy(req, err)
        util.destroy(res, err)

        if (err && request.controller) {
          request.controller.error(err)
        }

        request.runInAsyncScope(
          callback,
          null,
          err,
          null
        )
      }
    }).on('prefinish', () => {
      // Node < 15 does not call _final in same tick.
      req.push(null)
    })

    // TODO: Avoid copy.
    opts = { ...opts, body: req }

    const request = new PipelineHandler(opts, function (err, data) {
      if (err) {
        util.destroy(ret, err)
        return
      }

      const {
        statusCode,
        headers,
        opaque,
        resume
      } = data

      const request = this
      res = new Readable({
        autoDestroy: true,
        read: resume,
        destroy (err, callback) {
          resume()

          if (!err && !this._readableState.endEmitted) {
            err = new RequestAbortedError()
          }

          if (err) {
            util.destroy(ret, err)
          }

          request.runInAsyncScope(
            callback,
            null,
            err,
            null
          )
        }
      })

      try {
        body = handler({
          statusCode,
          headers,
          opaque,
          body: res
        })
      } catch (err) {
        res.on('error', util.nop)
        util.destroy(ret, err)
        return
      }

      // TODO: Should we allow !body?
      if (!body || typeof body.on !== 'function') {
        util.destroy(ret, new InvalidReturnValueError('expected Readable'))
        return
      }

      // TODO: If body === res then avoid intermediate
      // and write directly to ret.push? Or should this
      // happen when body is null?

      let ended = false
      body
        .on('data', function (chunk) {
          if (!ret.push(chunk) && this.pause) {
            this.pause()
          }
        })
        .on('error', function (err) {
          util.destroy(ret, err)
        })
        .on('end', function () {
          ended = true
          ret.push(null)
        })
        .on('close', function () {
          if (!ended) {
            util.destroy(ret, new RequestAbortedError())
          }
        })

      if (typeof body.destroy === 'function') {
        body.destroy = this.runInAsyncScope.bind(this, body.destroy, body)
      }

      return function (err, chunk) {
        if (res.destroyed) {
          return null
        } else if (err) {
          res.destroy(err)
        } else {
          const ret = res.push(chunk)
          return res.destroyed ? null : ret
        }
      }
    })

    client.dispatch(opts, request)

    return ret
  } catch (err) {
    return new PassThrough().destroy(err)
  }
}
