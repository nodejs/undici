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
  kResume
} = require('./symbols')
const ClientBase = require('./client-base')
const assert = require('assert')

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
    this.enqueue(opts, function (err, data) {
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
            // `body` can be destroyed inside `push()` and paused
            // afterwards. Make sure resume will always happen last.
            // TODO: Add more tests for this.
            process.nextTick(resume)
          }
          callback(err, null)
        }
      })

      // TODO: Do we need wrap here?
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
          return this.push(chunk)
        }
      })
    })
  }

  pipeline (opts, handler) {
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
      autoDestroy: true,
      writableHighWaterMark: 1,
      read () {
        if (body) {
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

    this.enqueue(opts, function (err, data) {
      if (err) {
        if (!ret.destroyed) {
          ret.destroy(err)
        }
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
            if (!ret.destroyed) {
              ret.destroy(err)
            }
            // `body` can be destroyed inside `push()` handler and paused
            // afterwards. Make sure resume will always happen last.
            // TODO: Add more tests for this.
            process.nextTick(resume)
          }
          callback(err, null)
        }
      })

      // TODO: Do we need wrap here?
      res.destroy = this.wrap(res, res.destroy)

      // TODO: Do we need wrap here?
      ret.destroy = this.wrap(ret, ret.destroy)

      try {
        body = handler({
          statusCode,
          headers,
          opaque,
          body: res
        })
      } catch (err) {
        if (!ret.destroyed) {
          ret.destroy(err)
        }
        return
      }

      // TODO: Should we allow !body?
      if (!body || typeof body.pipe !== 'function') {
        if (!ret.destroyed) {
          ret.destroy(new InvalidReturnValueError('expected Readable'))
        }
        return
      }

      // TODO: If body === res then avoid intermediate
      // and write directly to ret.push? Or should this
      // happen when body is null?

      body
        .on('data', function (chunk) {
          if (!ret.push(chunk)) {
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
          return this.push(chunk)
        }
      })
    })

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
    this.enqueue(opts, function (err, data) {
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
        typeof body.destroy !== 'function' ||
        typeof body.destroyed !== 'boolean'
      ) {
        callback(new InvalidReturnValueError('expected Writable'), null)
        return
      }

      body.on('drain', resume)
      // TODO: Avoid finished. It registers an unecessary amount of listeners.
      finished(body, { readable: false }, (err) => {
        body.removeListener('drain', resume)
        if (err) {
          if (!body.destroyed) {
            body.destroy(err)
          }
          // `body` can be destroyed inside `write()` and paused
          // afterwards. Make sure resume will always happen last.
          // TODO: Add more tests for this.
          process.nextTick(resume)
        }
        callback(err, null)
      })

      // TODO: Do we need wrap here?
      body.destroy = this.wrap(body, body.destroy)

      return this.wrap(body, function (err, chunk) {
        if (this.destroyed) {
          return null
        } else if (err) {
          this.destroy(err)
        } else if (chunk == null) {
          this.end()
        } else {
          return this.write(chunk)
        }
      })
    })
  }
}

module.exports = Client
