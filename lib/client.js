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
  NotSupportedError
} = require('./errors')
const {
  kEnqueue,
  kResume
} = require('./symbols')
const ClientBase = require('./client-base')
const assert = require('assert')

function nop () {}

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

    // TODO: Avoid closure due to capture.
    this[kEnqueue](opts, function (err, data) {
      if (!callback) {
        return
      }

      if (err) {
        callback(err, null)
        callback = null
        return
      }

      assert(data)

      const {
        statusCode,
        headers,
        opaque,
        resume
      } = data

      if (statusCode === 101) {
        callback(new NotSupportedError('101 response not supported'), null)
        callback = null
        return
      }

      if (!statusCode || statusCode < 200) {
        return
      }

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
      callback = null

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
          } else if (!ret.destroyed) {
            // Stop ret from scheduling more writes.
            ret.destroy(err)
          }
        } else {
          assert(this._readableState.endEmitted)
          assert(!this[kResume])
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
      final (callback) {
        req.push(null)
        callback()
      },
      destroy (err, callback) {
        if (!err && !this._readableState.endEmitted) {
          err = new RequestAbortedError()
        }
        if (!req.destroyed) {
          req.destroy(err)
        }
        if (res && !res.destroyed) {
          res.destroy(err)
        }
        callback(err)
      }
    })

    // TODO: Avoid copy.
    opts = { ...opts, body: req }

    // TODO: Avoid closure due to capture.
    const request = this[kEnqueue](opts, function (err, data) {
      if (ret.destroyed || res) {
        return
      }

      if (err) {
        if (!ret.destroyed) {
          ret.destroy(err)
        }
        return
      }

      assert(data)

      const {
        statusCode,
        headers,
        opaque,
        resume
      } = data

      if (statusCode === 101) {
        if (!ret.destroyed) {
          ret.destroy(new NotSupportedError('101 response not supported'))
        }
        return
      }

      if (!statusCode || statusCode < 200) {
        return
      }

      res = new Readable({
        autoDestroy: true,
        read: resume,
        destroy (err, callback) {
          if (!err && !this._readableState.endEmitted) {
            err = new RequestAbortedError()
          }
          if (err) {
            if (!ret.destroyed) {
              ret.destroy(err)
            }
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
        res.on('error', nop)
        if (!ret.destroyed) {
          ret.destroy(err)
        }
        return
      }

      // TODO: Should we allow !body?
      if (!body || typeof body.on !== 'function') {
        if (!ret.destroyed) {
          ret.destroy(new InvalidReturnValueError('expected Readable'))
        }
        return
      }

      // TODO: If body === res then avoid intermediate
      // and write directly to ret.push? Or should this
      // happen when body is null?

      // TODO: body.destroy?

      body
        .on('data', function (chunk) {
          if (!ret.push(chunk) && this.pause) {
            this.pause()
          }
        })
        .on('error', function (err) {
          if (!ret.destroyed) {
            ret.destroy(err)
          }
        })
        .on('end', function () {
          ret.push(null)
        })
        .on('close', function () {
          if (!this._readableState.endEmitted && !ret.destroyed) {
            ret.destroy(new RequestAbortedError())
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

    // TODO: Avoid closure due to capture.
    this[kEnqueue](opts, function (err, data) {
      if (!callback) {
        return
      }

      if (err) {
        callback(err, null)
        callback = null
        return
      }

      assert(data)

      const {
        statusCode,
        headers,
        opaque,
        resume
      } = data

      if (statusCode === 101) {
        callback(new NotSupportedError('101 response not supported'), null)
        callback = null
        return
      }

      if (!statusCode || statusCode < 200) {
        return
      }

      let body
      try {
        body = factory({
          statusCode,
          headers,
          opaque
        })
      } catch (err) {
        callback(err, null)
        callback = null
        return
      }

      if (!body) {
        callback(null, null)
        callback = null
        return
      }

      if (
        typeof body.write !== 'function' ||
        typeof body.end !== 'function' ||
        typeof body.on !== 'function' ||
        typeof body.destroy !== 'function' ||
        typeof body.destroyed !== 'boolean'
      ) {
        callback(new InvalidReturnValueError('expected Writable'), null)
        callback = null
        return
      }

      const onFinished = callback
      callback = null

      body.on('drain', resume)
      // TODO: Avoid finished. It registers an unecessary amount of listeners.
      finished(body, { readable: false }, (err) => {
        body.removeListener('drain', resume)
        if (err) {
          if (!body.destroyed) {
            body.destroy(err)
          }
          resume()
        }
        onFinished(err, null)
      })

      body.destroy = this.wrap(body, body.destroy)

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
