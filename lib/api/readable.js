'use strict'

const { Readable } = require('stream')
const assert = require('assert')

let Blob
let ReadableStream

const kBody = Symbol('body')
const kDestroyed = Symbol('destroyed')

const kWebStreamType = 1
const kTextType = 2
const kBlobType = 3
const kArrayBufferType = 4
const kJSONType = 5

class AbortError extends Error {
  constructor () {
    super('The operation was aborted')
    this.code = 'ABORT_ERR'
    this.name = 'AbortError'
  }
}

module.exports = class BodyReadable extends Readable {
  constructor (opts) {
    // TODO (fix): Improve allocation by making readableState
    // allocated as lazily as possible and/or introduce pooling.
    super(opts)
    this[kBody] = undefined
    this[kDestroyed] = false
  }

  get readableLength () {
    // TODO (fix): Read from web stream?
    return super.readableLength
  }

  get readableHighWaterMark () {
    // TODO (fix): Read from web stream?
    return super.readableHighWaterMark
  }

  destroy (err) {
    if (this[kDestroyed]) {
      return
    }

    if (this[kBody] && !err && !this._readableState.endEmitted) {
      err = new AbortError()
    }

    this[kDestroyed] = true

    return Readable.prototype.destroy.call(this, err)
  }

  push (val) {
    if (this[kBody]) {
      return this[kBody].push(val)
    }

    return Readable.prototype.push.call(this, val)
  }

  read (n) {
    if (this[kBody] === undefined) {
      consume(this)
    }
    return Readable.prototype.read.call(this, n)
  }

  resume () {
    if (this[kBody] === undefined) {
      consume(this)
    }
    return Readable.prototype.resume.call(this)
  }

  pause (dest, pipeOpts) {
    if (this[kBody] === undefined) {
      consume(this)
    }
    return Readable.prototype.pause.call(this)
  }

  pipe (dest, pipeOpts) {
    if (this[kBody] === undefined) {
      consume(this)
    }
    return Readable.prototype.pipe.call(this, dest, pipeOpts)
  }

  on (ev, fn) {
    if (this[kBody] === undefined && (ev === 'data' || ev === 'readable')) {
      consume(this)
    }
    return Readable.prototype.on.call(this, ev, fn)
  }

  addListener (ev, fn) {
    return this.on(ev, fn)
  }

  get bodyUsed () {
    if (this[kBody]) {
      return this[kBody].used
    }

    return this.readableDidRead !== undefined
      ? this.readableDidRead
      : this[kBody] === null
  }

  get body () {
    return consume(this, kWebStreamType)
  }

  text () {
    return consume(this, kTextType)
  }

  json () {
    return consume(this, kJSONType)
  }

  blob () {
    return consume(this, kBlobType)
  }

  arrayBuffer () {
    return consume(this, kArrayBufferType)
  }
}

function start (self) {
  assert(self.listenerCount('data') === 0)

  const state = self._readableState
  while (state.buffer.length) {
    self[kBody].push(state.buffer.shift())
  }
  if (state.ended) {
    self[kBody].push(null)
  }

  self._read()
}

function consume (self, type) {
  if (self.bodyUsed) {
    throw new TypeError('disturbed')
  }

  if (self.locked) {
    throw new TypeError('locked')
  }

  if (!type) {
    self[kBody] = null
    return self
  }

  if (type === kWebStreamType) {
    if (!ReadableStream) {
      ReadableStream = require('stream/web').ReadableStream
    }

    // TODO (fix): emit pause/resume on self?

    return new ReadableStream({
      start (controller) {
        if (self[kBody]) {
          // TODO (fix): it's a little unclear what we need to do here.
          this.controller.error(new Error('locked'))
        } else {
          self[kBody] = {
            type,
            used: false,
            buffer: self,
            controller,
            push (val) {
              if (self.destroyed) {
                return false
              }

              // TODO (fix): This is not strictly correct.
              // Just because chunk was enqueued doesn't mean
              // that it was read?
              this.used = true

              if (!this.controller) {
                this.buffer.push(val)
                return false
              }

              if (!val) {
                this.controller.close()

                // TODO (fix): This is not strictly correct.
                // Just because chunk was enqueued doesn't mean
                // that it was read? How do we wait for stream
                // to be drained? queueMicrotask is just a hack
                // to hope that it's been drained.
                queueMicrotask(() => {
                  Readable.prototype.push.call(self, null)
                })
              } else {
                this.controller.enqueue(new Uint8Array(val))
              }

              return this.controller.desiredSize > 0
            }
          }
        }

        return new Promise((resolve, reject) => {
          const orgEmit = self.emit

          function cleanup () {
            self.emit = orgEmit
            self.off('error', check)
          }

          function check (err) {
            if (!err && !this._readableState.constructed) {
              return
            }

            if (err) {
              reject(err)
            } else {
              self
                .on('error', err => {
                  this.controller.error(err)
                })
                .on('end', () => {
                  // autoDestroy might have been disabled.
                  self.destroy()
                })
                .on('close', () => {
                  // TODO (fix): Do webstreams have something
                  // corresponding?
                })

              start(self)

              resolve()
            }

            cleanup()
          }

          self.emit = function (ev, fn) {
            check(null)
            return orgEmit.call(this, ev, fn)
          }
          self.on('error', check)

          check()
        })
      },

      pull () {
        self._read()
      },

      cancel (reason) {
        let err

        if (reason instanceof Error) {
          err = reason
        } else if (typeof reason === 'string') {
          err = new Error(reason)
        } else {
          err = new AbortError()
        }

        self.destroy(err)
      }
    }, { highWaterMark: 16 * 1024 })
  }

  return new Promise((resolve, reject) => {
    self
      .on('error', reject)
      .on('end', () => {
        // autoDestroy might have been disabled.
        self.destroy()
      })
    self[kBody] = {
      type,
      used: false,
      body: this.type === kTextType || this.type === kJSONType ? '' : [],
      push (val) {
        if (self.destroyed) {
          return false
        }

        this.used = true

        if (val !== null) {
          if (this.type === kTextType || this.type === kJSONType) {
            this.body += val
          } else {
            this.body.push(val)
          }
        } else {
          try {
            if (this.type === kTextType) {
              resolve(this.body)
            } else if (this.type === kJSONType) {
              resolve(JSON.parse(this.body))
            } else if (this.type === kArrayBufferType) {
              resolve(Buffer.concat(this.body).buffer)
            } else if (this.type === kBlobType) {
              if (!Blob) {
                Blob = require('buffer').Blob
              }
              resolve(new Blob(this.body))
            }

            this.body = null
            Readable.prototype.push.call(self, null)
          } catch (err) {
            self.destroy(err)
          }
        }

        return true
      }
    }

    start(self)
  })
}
