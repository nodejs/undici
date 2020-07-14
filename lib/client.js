const {
  Readable,
  Duplex,
  PassThrough,
  finished
} = require('stream')
const {
  InvalidArgumentError,
  InvalidReturnValueError,
  RequestAbortedError
} = require('./errors')
const {
  kEnqueue,
  kResume
} = require('./symbols')
const ClientBase = require('./client-base')
const assert = require('assert')
const util = require('./util')

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

    if (!opts || typeof opts !== 'object') {
      process.nextTick(callback, new InvalidArgumentError('invalid opts'), null)
      return
    }

    // TODO: Avoid closure due to callback capture.
    this[kEnqueue](opts, function (err, data) {
      if (err) {
        callback(err, null)
        return
      }

      const {
        statusCode,
        headers,
        opaque,
        resume
      } = data

      const body = new Readable({
        autoDestroy: true,
        read: resume,
        destroy (err, callback) {
          if (!err && !this._readableState.endEmitted) {
            err = new RequestAbortedError()
          }
          if (err) {
            resume()
          }
          callback(err, null)
        }
      })
      body.destroy = this.wrap(body, body.destroy)

      callback(null, {
        statusCode,
        headers,
        opaque,
        body
      })

      return this.wrap(body, function (err, chunk) {
        if (this.destroyed) {
          return null
        } else if (err) {
          this.destroy(err)
        } else {
          const ret = this.push(chunk)
          return this.destroyed ? null : ret
        }
      })
    })
  }

  pipeline (opts, handler) {
    if (!opts || typeof opts !== 'object') {
      return new PassThrough().destroy(new InvalidArgumentError('invalid opts'))
    }

    if (typeof handler !== 'function') {
      return new PassThrough().destroy(new InvalidArgumentError('invalid handler'))
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

        callback(err)
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
        util.destroy(req, err)
        util.destroy(res, err)
        callback(err)
      }
    }).on('prefinish', () => {
      // Node < 15 does not call _final in same tick.
      req.push(null)
    })

    // TODO: Avoid copy.
    opts = { ...opts, body: req }

    const request = this[kEnqueue](opts, function (err, data) {
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

      res = new Readable({
        autoDestroy: true,
        read: resume,
        destroy (err, callback) {
          if (!err && !this._readableState.endEmitted) {
            err = new RequestAbortedError()
          }
          if (err) {
            util.destroy(ret, err)
            resume()
          }
          callback(err, null)
        }
      })
      res.destroy = this.wrap(res, res.destroy)

      try {
        body = handler({
          statusCode,
          headers,
          opaque,
          body: res
        })
      } catch (err) {
        res.on('error', util.nop)
        if (!ret.destroyed) {
          ret.destroy(err)
        }
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

      // TODO: body.destroy?

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

      return this.wrap(res, function (err, chunk) {
        if (this.destroyed) {
          return null
        } else if (err) {
          this.destroy(err)
        } else {
          const ret = this.push(chunk)
          return this.destroyed ? null : ret
        }
      })
    })

    ret.destroy = request.wrap(ret, ret.destroy)

    return ret
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

    if (!opts || typeof opts !== 'object') {
      process.nextTick(callback, new InvalidArgumentError('invalid opts'), null)
      return
    }

    if (typeof factory !== 'function') {
      process.nextTick(callback, new InvalidArgumentError('invalid factory'), null)
      return
    }

    // TODO: Avoid closure due to callback capture.
    this[kEnqueue](opts, function (err, data) {
      if (err) {
        callback(err)
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
        if (err) {
          util.destroy(body, err)
          resume()
        } else {
          // TODO: destroy if body is not Readable?
        }
        callback(err, null)
      })

      if (typeof body.destroy === 'function') {
        body.destroy = this.wrap(body, body.destroy)
      }

      return this.wrap(body, function (err, chunk) {
        if (this.destroyed) {
          return null
        } else if (err) {
          this.destroy(err)
        } else if (chunk == null) {
          this.end()
        } else {
          const ret = this.write(chunk)
          return this.destroyed ? null : ret
        }
      })
    })
  }
}

module.exports = Client
