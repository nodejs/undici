'use strict'

const {
  Readable,
  Duplex,
  PassThrough
} = require('stream')
const {
  InvalidArgumentError,
  InvalidReturnValueError,
  ClientClosedError,
  ClientDestroyedError,
  NotSupportedError,
  RequestAbortedError,
  RequestTimeoutError
} = require('./errors')
const Request = require('./request')
const assert = require('assert')
const util = require('./util')
const {
  kResume,
  kRequestTimeout,
  kEnqueue,
  kDestroyed,
  kClosed
} = require('./symbols')

// TODO: Refactor

class PipelineRequest extends Request {
  constructor ({ requestTimeout, ...opts }, callback) {
    super(opts)

    if (requestTimeout != null && (!Number.isInteger(requestTimeout) || requestTimeout < 0)) {
      throw new InvalidArgumentError('requestTimeout must be a positive integer or zero')
    }

    this.timeout = requestTimeout
      ? setTimeout((self) => {
        self.onError(new RequestTimeoutError())
      }, requestTimeout, this)
      : null
    this.callback = callback
    this.aborted = false
  }

  onHeaders (statusCode, headers, resume) {
    if (statusCode < 200) {
      // TODO: Informational response.
      return
    }

    if (this.aborted) {
      return
    }
    this.aborted = true

    clearTimeout(this.timeout)
    this.timeout = null

    this.res = this.callback(null, {
      statusCode,
      headers,
      opaque: this.opaque,
      resume
    })
  }

  onBody (chunk, offset, length) {
    if (this.res) {
      return this.res(null, chunk.slice(offset, offset + length))
    }
  }

  onComplete (trailers) {
    // TODO: Trailers?

    if (this.res) {
      const res = this.res
      this.res = null
      res(null, null)
    }
  }

  onError (err) {
    if (util.isStream(this.body)) {
      // TODO: If this.body.destroy doesn't exists or doesn't emit 'error' or
      // 'close', it can halt execution in client.
      const body = this.body
      this.body = null
      util.destroy(body, err)
    }

    if (this.res) {
      const res = this.res
      this.res = null
      res(err, null)
    }

    if (this.aborted) {
      return
    }
    this.aborted = true

    clearTimeout(this.timeout)
    this.timeout = null

    this.callback(err, null)
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
      throw new NotSupportedError('CONNECT method is not supported')
    }

    if (client[kDestroyed]) {
      throw new ClientDestroyedError()
    }

    if (client[kClosed]) {
      throw new ClientClosedError()
    }

    if (opts.requestTimeout == null && client[kRequestTimeout]) {
      // TODO: Avoid copy.
      opts = { ...opts, requestTimeout: client[kRequestTimeout] }
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
        if (err) {
          if (this[kResume]) {
            const resume = this[kResume]
            this[kResume] = null
            resume(err)
          } else {
            // Stop ret from scheduling more writes.
            util.destroy(ret, err)
          }
        } else {
          if (!this._readableState.endEmitted) {
            // This can happen if the server doesn't care
            // about the entire request body.
            // TODO: Is this fine to ignore?
          }
        }

        if (request) {
          request.runInAsyncScope(
            callback,
            null,
            err,
            null
          )
        } else {
          callback(err, null)
        }
      }
    }).on('error', util.nop)

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
        assert(!req.destroyed)
        if (req.push(chunk, encoding)) {
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
        if (request) {
          request.runInAsyncScope(
            callback,
            null,
            err,
            null
          )
        } else {
          callback(err, null)
        }
      }
    }).on('prefinish', () => {
      // Node < 15 does not call _final in same tick.
      req.push(null)
      client[kResume]()
    })

    // TODO: Avoid copy.
    opts = { ...opts, body: req }

    const request = new PipelineRequest(opts, function (err, data) {
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
