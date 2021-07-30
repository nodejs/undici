/* istanbul ignore file: TODO add more coverage */

// Ported from https://github.com/nodejs/undici/pull/907

'use strict'

const assert = require('assert')
const { Readable } = require('stream')
const { InvalidArgumentError, RequestAbortedError } = require('../core/errors')

let StringDecoder
let Blob

const kConsume = Symbol('kConsume')
const kReading = Symbol('kReading')
const kBody = Symbol('kBody')

const kTextType = 1
const kBlobType = 2
const kArrayBufferType = 3
const kJSONType = 4

module.exports = class BodyReadable extends Readable {
  constructor (opts) {
    super(opts)

    this._readableState.dataEmitted = false

    this[kConsume] = null
    this[kBody] = null
    this[kReading] = false // Is stream being consumed through Readable API?
  }

  destroy (err) {
    if (this.destroyed) {
      // Node < 16
      return this
    }
    return super.destroy(err)
  }

  emit (ev, ...args) {
    if (ev === 'data') {
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

  push (chunk, encoding) {
    if (this[kConsume] && chunk !== null && !this[kReading]) {
      // Fast path.
      return consumePush(
        this[kConsume],
        chunk,
        encoding || this._readableState.defaultEncoding
      )
    }

    const pushed = super.push(chunk, encoding)
    const consumed = consumePush(this[kConsume], chunk, encoding)

    return pushed && consumed
  }

  // https://fetch.spec.whatwg.org/#dom-body-text
  text () {
    return consume(this, kTextType)
  }

  // https://fetch.spec.whatwg.org/#dom-body-json
  json () {
    return consume(this, kJSONType)
  }

  // https://fetch.spec.whatwg.org/#dom-body-blob
  blob () {
    return consume(this, kBlobType)
  }

  // https://fetch.spec.whatwg.org/#dom-body-arraybuffer
  arrayBuffer () {
    return consume(this, kArrayBufferType)
  }

  // https://fetch.spec.whatwg.org/#dom-body-bodyused
  get bodyUsed () {
    return isDisturbed(this)
  }

  // https://fetch.spec.whatwg.org/#dom-body-body
  get body () {
    if (!this[kBody]) {
      this[kBody] = Readable.toWeb(this)
      if (this[kConsume]) {
        // TODO: Is this the best way to force a lock?
        this[kBody].getReader() // Ensure stream is locked.
        assert(this[kBody].locked)
      }
    }
    return this[kBody]
  }
}

// https://streams.spec.whatwg.org/#readablestream-locked
function isLocked (self) {
  // consume is implicit lock
  return (self[kBody] && self[kBody].locked === true) || self[kConsume]
}

// https://streams.spec.whatwg.org/#readablestream-disturbed
function isDisturbed (self) {
  const { _readableState: state } = self
  return !!(
    state.dataEmitted ||
    state.endEmitted ||
    state.errorEmitted ||
    state.closeEmitted
  )
}

// https://fetch.spec.whatwg.org/#body-unusable
function isUnusable (self) {
  return isDisturbed(self) || isLocked(self)
}

async function consume (stream, type) {
  if (isUnusable(stream)) {
    throw new TypeError('unusable')
  }

  assert(!stream[kConsume])

  return new Promise((resolve, reject) => {
    stream[kConsume] = {
      type,
      stream,
      resolve,
      reject,
      length: 0,
      decoder: undefined,
      body: undefined,
      reading: false,
      pushed: false,
      ended: false
    }

    stream
      .on('error', function (err) {
        consumeFinish(this[kConsume], err)
      })
      .on('close', function () {
        if (this[kConsume].body !== null) {
          // TODO: Use Node error?
          consumeFinish(this[kConsume], new RequestAbortedError())
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

  while (consume.stream.read() != null);
}

function consumeEnd (consume) {
  const { type, body, resolve, decoder, stream, length } = consume

  try {
    if (type === kTextType) {
      resolve(body + (decoder ? decoder.end() : ''))
    } else if (type === kJSONType) {
      resolve(JSON.parse(body + (decoder ? decoder.end() : '')))
    } else if (type === kArrayBufferType) {
      const dst = new Uint8Array(length)

      let pos = 0
      for (const buf of body) {
        dst.set(buf, pos)
        pos += buf.byteLength
      }

      resolve(dst)
    } else if (type === kBlobType) {
      if (!Blob) {
        Blob = require('buffer').Blob
      }
      resolve(new Blob(body))
    }

    consumeFinish(consume)
  } catch (err) {
    stream.destroy(err)
  }
}

function consumePush (consume, chunk, encoding) {
  if (!consume) {
    return true
  }

  if (consume.ended) {
    return false
  }

  if (chunk === null) {
    consume.ended = true
    consume.stream.read()
    return false
  }

  consume.pushed = true

  if (consume.type === kTextType || consume.type === kJSONType) {
    consumePushString(consume, chunk, encoding)
  } else {
    consumePushBuffer(consume, chunk, encoding)
  }

  if (!consume.stream[kReading] && !consume.reading) {
    consume.reading = true
    process.nextTick(consumeReadMore, consume)
  }

  return true
}

function consumePushString (consume, chunk, encoding) {
  if (!consume.body) {
    consume.body = ''
  }

  if (typeof chunk === 'string') {
    if (consume.decoder) {
      chunk = consume.decoder.write(Buffer.from(chunk, encoding))
    } else if (encoding !== 'utf8') {
      chunk = Buffer.from(chunk, encoding).toString()
    }
  } else if (ArrayBuffer.isView(chunk)) {
    if (!consume.decoder) {
      if (!StringDecoder) {
        StringDecoder = require('string_decoder').StringDecoder
      }
      consume.decoder = new StringDecoder('utf8')
    }
    chunk = consume.decoder.write(chunk)
  } else {
    // TODO: What if objectMode? Should we just fail consume
    // or throw?
    // TODO: Use Node error?
    throw new InvalidArgumentError('chunk')
  }

  consume.length += chunk.length
  consume.body += chunk
}

function consumePushBuffer (consume, chunk, encoding) {
  if (!consume.body) {
    consume.body = []
  }

  if (typeof chunk === 'string') {
    chunk = Buffer.from(chunk, encoding)
  } else if (!ArrayBuffer.isView(chunk)) {
    // TODO: What if objectMode? Should we just fail consume
    // or throw?
    // TODO: Use Node error?
    throw new InvalidArgumentError('chunk')
  }

  consume.length += chunk.byteLength
  consume.body.push(chunk)
}

function consumeReadMore (consume) {
  consume.pushed = true

  while (consume.pushed && !consume.stream[kReading]) {
    consume.pushed = false
    consume.stream._read(consume.stream)
  }

  consume.pushed = false
  consume.reading = false
}

function consumeFinish (consume, err) {
  if (consume.body === null) {
    return
  }

  if (err) {
    consume.reject(err)
  } else {
    consume.resolve()
  }

  consume.reject = null
  consume.resolve = null
  consume.decoder = null
  consume.body = null
}
