const {
  Readable,
  Duplex,
  PassThrough,
  finished
} = require('stream')
const {
  InvalidArgumentError,
  InvalidReturnValueError,
  RequestAbortedError,
  ClientClosedError,
  ClientDestroyedError,
  RequestTimeoutError
} = require('./errors')
const Request = require('./request')
const {
  kEnqueue,
  kRequestTimeout,
  kResume,
  kDestroyed,
  kClosed
} = require('./symbols')
const ClientBase = require('./client-base')
const assert = require('assert')
const util = require('./util')

class BasicRequest extends Request {
  constructor ({ requestTimeout, ...opts }, callback) {
    super(opts)

    assert(typeof callback === 'function')

    if (requestTimeout != null && (!Number.isInteger(requestTimeout) || requestTimeout < 0)) {
      throw new InvalidArgumentError('requestTimeout must be a positive integer or zero')
    }

    this.timeout = requestTimeout
      ? setTimeout((self) => {
        self.onError(new RequestTimeoutError())
      }, requestTimeout, this)
      : null
    this.callback = callback
    this.finished = false
  }

  onHeaders (statusCode, headers, resume) {
    if (statusCode < 200) {
      // TODO: Informational response.
      return
    }

    if (this.finished) {
      return
    }
    this.finished = true

    clearTimeout(this.timeout)
    this.timeout = null

    this.res = this.callback(null, {
      statusCode,
      headers,
      opaque: this.opaque,
      resume
    })
    assert(!this.res || typeof this.res === 'function')
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

    if (this.finished) {
      return
    }
    this.finished = true

    clearTimeout(this.timeout)
    this.timeout = null

    this.callback(err, null)
  }
}

class Client extends ClientBase {
  request (opts, callback) {
    if (callback === undefined) {
      return new Promise((resolve, reject) => {
        this.request(opts, (err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    if (typeof callback !== 'function') {
      throw new InvalidArgumentError('invalid callback')
    }

    try {
      if (!opts || typeof opts !== 'object') {
        throw new InvalidArgumentError('invalid opts')
      }

      if (this[kDestroyed]) {
        throw new ClientDestroyedError()
      }

      if (this[kClosed]) {
        throw new ClientClosedError()
      }

      if (opts.requestTimeout == null && this[kRequestTimeout]) {
        // TODO: Avoid copy.
        opts = { ...opts, requestTimeout: this[kRequestTimeout] }
      }

      this[kEnqueue](new BasicRequest(opts, function (err, data) {
        if (err) {
          process.nextTick(callback, err, null)
          return
        }

        const {
          statusCode,
          headers,
          opaque,
          resume
        } = data

        const request = this
        const body = new Readable({
          autoDestroy: true,
          read: resume,
          destroy (err, callback) {
            resume()

            if (!err && !this._readableState.endEmitted) {
              err = new RequestAbortedError()
            }

            request.runInAsyncScope(
              callback,
              null,
              err,
              null
            )
          }
        })

        callback(null, {
          statusCode,
          headers,
          opaque,
          body
        })

        return function (err, chunk) {
          if (body.destroyed) {
            return null
          } else if (err) {
            body.destroy(err)
          } else {
            const ret = body.push(chunk)
            return body.destroyed ? null : ret
          }
        }
      }))
    } catch (err) {
      process.nextTick(callback, err, null)
    }
  }

  pipeline (opts, handler) {
    try {
      if (!opts || typeof opts !== 'object') {
        throw new InvalidArgumentError('invalid opts')
      }

      if (typeof handler !== 'function') {
        throw new InvalidArgumentError('invalid handler')
      }

      if (this[kDestroyed]) {
        throw new ClientDestroyedError()
      }

      if (this[kClosed]) {
        throw new ClientClosedError()
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
        this[kResume]()
      })

      // TODO: Avoid copy.
      opts = { ...opts, body: req }

      if (opts.requestTimeout == null && this[kRequestTimeout]) {
        // TODO: Avoid copy.
        opts = { ...opts, requestTimeout: this[kRequestTimeout] }
      }

      const request = new BasicRequest(opts, function (err, data) {
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

      this[kEnqueue](request)

      return ret
    } catch (err) {
      return new PassThrough().destroy(err)
    }
  }

  stream (opts, factory, callback) {
    if (callback === undefined) {
      return new Promise((resolve, reject) => {
        this.stream(opts, factory, (err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    if (typeof callback !== 'function') {
      throw new InvalidArgumentError('invalid callback')
    }

    try {
      if (!opts || typeof opts !== 'object') {
        throw new InvalidArgumentError('invalid opts')
      }

      if (typeof factory !== 'function') {
        throw new InvalidArgumentError('invalid factory')
      }

      if (this[kDestroyed]) {
        throw new ClientDestroyedError()
      }

      if (this[kClosed]) {
        throw new ClientClosedError()
      }

      if (opts.requestTimeout == null && this[kRequestTimeout]) {
        // TODO: Avoid copy.
        opts = { ...opts, requestTimeout: this[kRequestTimeout] }
      }

      this[kEnqueue](new BasicRequest(opts, function (err, data) {
        if (err) {
          process.nextTick(callback, err, null)
          return
        }

        const {
          statusCode,
          headers,
          opaque,
          resume
        } = data

        let body
        try {
          body = factory({
            statusCode,
            headers,
            opaque
          })
        } catch (err) {
          callback(err, null)
          return
        }

        if (!body) {
          callback(null, null)
          return
        }

        if (
          typeof body.write !== 'function' ||
          typeof body.end !== 'function' ||
          typeof body.on !== 'function'
        ) {
          callback(new InvalidReturnValueError('expected Writable'), null)
          return
        }

        body.on('drain', resume)
        // TODO: Avoid finished. It registers an unecessary amount of listeners.
        finished(body, { readable: false }, (err) => {
          body.removeListener('drain', resume)
          resume()

          if (err || !body.readable) {
            util.destroy(body, err)
          }

          callback(err, null)
        })

        if (typeof body.destroy === 'function') {
          body.destroy = this.runInAsyncScope.bind(this, body.destroy, body)
        }

        return function (err, chunk) {
          if (util.isDestroyed(body)) {
            return null
          } else if (err) {
            util.destroy(body, err)
          } else if (chunk == null) {
            body.end()
          } else {
            const ret = body.write(chunk)
            return util.isDestroyed(body) ? null : ret
          }
        }
      }))
    } catch (err) {
      process.nextTick(callback, err, null)
    }
  }
}

module.exports = Client
