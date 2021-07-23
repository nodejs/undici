'use strict'

const { Readable } = require('stream')
const assert = require('assert')

let Blob
let ReadableStream

const kBody = Symbol('body')

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
    super(opts)
    this[kBody] = undefined
  }

  destroy (err) {
    // TODO (fix): This is not strictly correct.
    if (!err && this[kBody] && !this[kBody].ended) {
      err = new AbortError()
    }

    return Readable.prototype.destroy.call(this, err)
  }

  push (val) {
    if (this[kBody]) {
      try {
        return this[kBody].push(val)
      } catch (err) {
        this.destroy(err)
        return false
      }
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
  try {
    if (self.bodyUsed) {
      throw new TypeError('disturbed')
    }

    if (self[kBody]) {
      throw new TypeError('locked')
    }
  } catch (err) {
    if (!type) {
      self.destroy(err)
    } else {
      throw err
    }
  }

  if (!type) {
    self[kBody] = null
    return self
  }

  if (type === kWebStreamType) {
    if (!ReadableStream) {
      ReadableStream = require('stream/web').ReadableStream
    }

    return new ReadableStream({
      start (controller) {
        if (self[kBody]) {
          // TODO (fix): it's a little unclear what we need to do here.
          this.controller.error(new Error('locked'))
        } else {
          self.on('error', err => {
            this.controller.error(err)
          })
          self[kBody] = {
            type,
            used: false,
            buffer: self,
            controller,
            ended: false,
            push (val) {
              // TODO (fix): This is not strictly correct.
              this.used = true

              if (!this.controller) {
                this.buffer.push(val)
                return false
              }

              if (!val) {
                this.controller.close()
                this.ended = true

                // TODO (fix): This is not strictly correct.
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
        start(self)
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
    self.on('error', reject)
    self[kBody] = {
      type,
      used: false,
      ended: false,
      body: this.type === kTextType || this.type === kJSONType ? '' : [],
      push (val) {
        this.used = true

        if (this.type === kTextType || this.type === kJSONType) {
          if (val !== null) {
            this.body += val
          } else if (this.type === kTextType) {
            resolve(this.body)
          } else if (this.type === kJSONType) {
            resolve(JSON.parse(this.body))
          }
        } else {
          if (val !== null) {
            this.body.push(val)
          } else if (this.type === kArrayBufferType) {
            resolve(Buffer.concat(this.body).buffer)
          } else if (this.type === kBlobType) {
            if (!Blob) {
              Blob = require('buffer').Blob
            }
            resolve(new Blob(this.body))
          }
        }

        if (val === null) {
          this.ended = true
          this.body = null
          queueMicrotask(() => {
            Readable.prototype.push.call(self, null)
          })
        }

        return true
      }
    }

    start(self)
  })
}
