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
const Request = require('./request')
const util = require('./util')
const { kEnqueue } = require('./symbols')

// TODO: Refactor

const kResume = Symbol('resume')

class PipelineRequest extends Request {
  constructor (client, opts, callback) {
    super(opts, client)

    if (opts.onInfo && typeof opts.onInfo !== 'function') {
      throw new InvalidArgumentError('invalid opts.onInfo')
    }

    if (opts.onTrailers && typeof opts.onTrailers !== 'function') {
      throw new InvalidArgumentError('invalid opts.onTrailers')
    }

    this.opaque = opts.opaque || null
    this.resume = null
    this.callback = callback
    this.res = null
    this.onInfo = opts.onInfo
    this.onTrailers = opts.onTrailers
  }

  _onConnect (resume) {
    this.resume = resume
  }

  _onHeaders (statusCode, headers) {
    const { callback, opaque } = this

    if (statusCode < 200) {
      if (this.onInfo) {
        this.onInfo({ statusCode, headers, opaque })
      }
      return
    }

    this.callback = null
    this.res = callback.call(this, null, {
      statusCode,
      headers,
      opaque,
      resume: this.resume
    })
  }

  _onData (chunk) {
    const { res } = this

    return res ? res(null, chunk) : null
  }

  _onComplete (trailers) {
    const { res } = this

    if (!res) {
      return
    }

    if (trailers && this.onTrailers) {
      this.onTrailers({ trailers, opaque: this.opaque })
    }

    res(null, null)
  }

  _onError (err) {
    const { callback, res } = this

    if (res) {
      this.res = null
      res(err, null)
    }

    if (callback) {
      this.callback = null
      callback.call(this, err, null)
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

        request.res = null
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

    const request = new PipelineRequest(client, opts, function (err, data) {
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

    client[kEnqueue](request)

    return ret
  } catch (err) {
    return new PassThrough().destroy(err)
  }
}
