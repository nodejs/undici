// Ported from https://github.com/nodejs/undici/pull/907

'use strict'

const assert = require('assert')
const { Readable } = require('stream')
const { RequestAbortedError, NotSupportedError, InvalidArgumentError } = require('../core/errors')
const util = require('../core/util')
const { ReadableStreamFrom, toUSVString } = require('../core/util')

let Blob

const kConsume = Symbol('kConsume')
const kReading = Symbol('kReading')
const kBody = Symbol('kBody')
const kAbort = Symbol('abort')
const kContentType = Symbol('kContentType')

module.exports = class BodyReadable extends Readable {
  constructor ({
    resume,
    abort,
    contentType = '',
    highWaterMark = 64 * 1024 // Same as nodejs fs streams.
  }) {
    super({
      autoDestroy: true,
      read: resume,
      highWaterMark
    })

    this._readableState.dataEmitted = false

    this[kAbort] = abort
    this[kConsume] = null
    this[kBody] = null
    this[kContentType] = contentType

    // Is stream being consumed through Readable API?
    // This is an optimization so that we avoid checking
    // for 'data' and 'readable' listeners in the hot path
    // inside push().
    this[kReading] = false
  }

  destroy (err) {
    if (this.destroyed) {
      // Node < 16
      return this
    }

    if (!err && !this._readableState.endEmitted) {
      err = new RequestAbortedError()
    }

    if (err) {
      this[kAbort]()
    }

    return super.destroy(err)
  }

  emit (ev, ...args) {
    if (ev === 'data') {
      // Node < 16.7
      this._readableState.dataEmitted = true
    } else if (ev === 'error') {
      // Node < 16
      this._readableState.errorEmitted = true
    }
    return super.emit(ev, ...args)
  }

  on (ev, ...args) {
    if (ev === 'data' || ev === 'readable') {
      this[kReading] = true
    }
    return super.on(ev, ...args)
  }

  addListener (ev, ...args) {
    return this.on(ev, ...args)
  }

  off (ev, ...args) {
    const ret = super.off(ev, ...args)
    if (ev === 'data' || ev === 'readable') {
      this[kReading] = (
        this.listenerCount('data') > 0 ||
        this.listenerCount('readable') > 0
      )
    }
    return ret
  }

  removeListener (ev, ...args) {
    return this.off(ev, ...args)
  }

  push (chunk) {
    if (this[kConsume] && chunk !== null && this.readableLength === 0) {
      consumePush(this[kConsume], chunk)
      return this[kReading] ? super.push(chunk) : true
    }
    return super.push(chunk)
  }

  // https://fetch.spec.whatwg.org/#dom-body-text
  async text () {
    return consume(this, 'text')
  }

  // https://fetch.spec.whatwg.org/#dom-body-json
  async json () {
    return consume(this, 'json')
  }

  // https://fetch.spec.whatwg.org/#dom-body-blob
  async blob () {
    return consume(this, 'blob')
  }

  // https://fetch.spec.whatwg.org/#dom-body-arraybuffer
  async arrayBuffer () {
    return consume(this, 'arrayBuffer')
  }

  // https://fetch.spec.whatwg.org/#dom-body-formdata
  async formData () {
    // TODO: Implement.
    throw new NotSupportedError()
  }

  // https://fetch.spec.whatwg.org/#dom-body-bodyused
  get bodyUsed () {
    return util.isDisturbed(this)
  }

  // https://fetch.spec.whatwg.org/#dom-body-body
  get body () {
    if (!this[kBody]) {
      this[kBody] = ReadableStreamFrom(this)
      if (this[kConsume]) {
        // TODO: Is this the best way to force a lock?
        this[kBody].getReader() // Ensure stream is locked.
        assert(this[kBody].locked)
      }
    }
    return this[kBody]
  }

  async dump (opts) {
    return consume(this, 'dump', opts)
  }
}

// https://streams.spec.whatwg.org/#readablestream-locked
function isLocked (self) {
  // Consume is an implicit lock.
  return (self[kBody] && self[kBody].locked === true) || self[kConsume]
}

// https://fetch.spec.whatwg.org/#body-unusable
function isUnusable (self) {
  return util.isDisturbed(self) || isLocked(self)
}

async function consume (stream, type, opts) {
  if (isUnusable(stream)) {
    throw new TypeError('unusable')
  }

  assert(!stream[kConsume])

  return new Promise((resolve, reject) => {
    const limit = opts && Number.isFinite(opts.limit) ? opts.limit : 262144
    const signal = opts && opts.signal
    const abort = () => {
      stream.destroy()
    }

    if (signal) {
      if (typeof signal !== 'object' || !('aborted' in signal)) {
        throw new InvalidArgumentError('signal must be an AbortSignal')
      }
      util.throwIfAborted(signal)
      signal.addEventListener('abort', abort, { once: true })
    }

    stream[kConsume] = {
      type,
      stream,
      resolve,
      reject,
      length: 0,
      body: [],
      limit,
      signal,
      abort
    }

    stream
      .on('error', function (err) {
        consumeFinish(this[kConsume], this[kConsume].type !== 'dump' ? err : null)
      })
      .on('close', function () {
        if (this[kConsume].body !== null) {
          consumeFinish(this[kConsume], this[kConsume].type !== 'dump' ? new RequestAbortedError() : null)
        }
      })

    process.nextTick(consumeStart, stream[kConsume])
  })
}

function consumeStart (consume) {
  if (consume.body === null) {
    return
  }

  const { _readableState: state } = consume.stream

  for (const chunk of state.buffer) {
    consumePush(consume, chunk)
  }

  if (state.endEmitted) {
    consumeEnd(this[kConsume])
  } else {
    consume.stream.on('end', function () {
      consumeEnd(this[kConsume])
    })
  }

  consume.stream.resume()

  while (consume.stream.read() != null) {
    // Loop
  }
}

function consumeEnd (consume) {
  const { type, body, resolve, stream, length } = consume

  try {
    if (type === 'dump') {
      resolve(null)
    } else if (type === 'text') {
      resolve(toUSVString(Buffer.concat(body)))
    } else if (type === 'json') {
      resolve(JSON.parse(Buffer.concat(body)))
    } else if (type === 'arrayBuffer') {
      const dst = new Uint8Array(length)

      let pos = 0
      for (const buf of body) {
        dst.set(buf, pos)
        pos += buf.byteLength
      }

      resolve(dst)
    } else if (type === 'blob') {
      if (!Blob) {
        Blob = require('buffer').Blob
      }
      resolve(new Blob(body, { type: stream[kContentType] }))
    }

    consumeFinish(consume)
  } catch (err) {
    stream.destroy(err)
  }
}

function consumePush (consume, chunk) {
  consume.length += chunk.length

  if (consume.type !== 'dump') {
    consume.body.push(chunk)
  }

  if (consume.limit != null && consume.length > consume.limit) {
    consumeFinish(consume, consume.type !== 'dump' ? new RequestAbortedError('consumed body too large') : null)
  }

  if (consume.signal != null && consume.signal.aborted) {
    consumeFinish(consume, consume.type !== 'dump' ? consume.signal.reason ?? new RequestAbortedError() : null)
  }
}

function consumeFinish (consume, err) {
  if (consume.body === null) {
    return
  }

  if (consume.type === 'dump') {
    if (consume.signal.aborted) {
      if (consume.signal.reason) {
        consume.reject(consume.signal.reason)
      } else {
        try {
          util.throwIfAborted(consume.signal)
        } catch (err) {
          consume.reject(consume.signal.reason)
        }
      }
    } else {
      consume.resolve()
    }
  } else if (err) {
    consume.reject(err)
  } else {
    consume.resolve()
  }

  if (consume.signal) {
    consume.signal.addEventListener('abort', consume.abort, { once: true })
  }

  consume.type = null
  consume.stream = null
  consume.resolve = null
  consume.reject = null
  consume.length = 0
  consume.body = null
  consume.limit = null
  consume.signal = null
  consume.abort = null
}
