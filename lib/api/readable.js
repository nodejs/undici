'use strict'

const { Readable } = require('stream')
const { InvalidArgumentError } = require('../core/errors')

let StringDecoder
let Blob

const kConsume = Symbol('kConsume')
const kReading = Symbol('kReading')

const kWebStreamType = 1
const kTextType = 2
const kBlobType = 3
const kArrayBufferType = 4
const kJSONType = 5

class AbortError extends Error {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, AbortError)
    this.name = 'AbortError'
    this.message = 'aborted'
    this.code = 'UND_ERR_ABORTED'
  }
}

module.exports = class BodyReadable extends Readable {
  constructor (opts) {
    super(opts)

    this._readableState.dataEmitted = false

    this[kConsume] = null
    this[kReading] = false // Is stream being consumed through Readable API?
  }

  emit (ev, ...args) {
    if (ev === 'data') {
      this._readableState.dataEmitted = true
    }
    return super.emit(ev, ...args)
  }

  on (ev, ...args) {
    if (ev === 'data' || ev === 'readable') {
      this[kReading] = true
    }
    return super.on(ev, ...args)
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

  get body () {
    if (this[kConsume] && this[kConsume].type === kWebStreamType) {
      return this[kConsume].stream
    }

    return consume(this, kWebStreamType)
  }
}

function isLocked (self) {
  return (
    self[kConsume] &&
    self[kConsume].stream &&
    self[kConsume].stream.locked === true
  )
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

async function consume (parent, type) {
  if (isUnusable(parent)) {
    // eslint-disable-next-line no-restricted-syntax
    throw new TypeError('unusable')
  }

  if (parent[kConsume]) {
    // TODO: Should multiple consume in same tick be possible?
    // eslint-disable-next-line no-restricted-syntax
    throw new TypeError('unusable')
  }

  if (type === kWebStreamType) {
    const consume = parent[kConsume] = {
      type,
      // TODO: Optimized implementation for web streams.
      stream: Readable.toWeb(parent)
    }

    return consume.stream
  }

  return new Promise((resolve, reject) => {
    parent[kConsume] = {
      type,
      parent,
      resolve,
      reject,
      length: 0,
      decoder: undefined,
      body: undefined,
      reading: false,
      pushed: false,
      ended: false
    }

    parent
      .once('error', function (err) {
        consumeFinish(this[kConsume], err)
      })
      .once('close', function () {
        if (this[kConsume].body !== null) {
          consumeFinish(this[kConsume], new AbortError())
        }
      })

    process.nextTick(consumeStart, parent[kConsume])
  })
}

function consumeStart (consume) {
  if (consume.body === null) {
    return
  }

  const { _readableState: state } = consume.parent

  for (const chunk of state.buffer) {
    consumePush(consume, chunk)
  }

  if (state.endEmitted) {
    consumeEnd(this[kConsume])
  } else {
    consume.parent.once('end', function () {
      consumeEnd(this[kConsume])
    })
  }

  if (consume.parent.isPaused()) {
    consume.parent.resume()
  }

  while (consume.parent.read() != null);
}

function consumeEnd (consume) {
  const { type, body, resolve, decoder, parent, length } = consume

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
    parent.destroy(err)
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
    consume.parent.read()
    return false
  }

  consume.pushed = true

  if (consume.type === kTextType || consume.type === kJSONType) {
    consumePushString(consume, chunk, encoding)
  } else {
    consumePushBuffer(consume, chunk, encoding)
  }

  if (!consume.parent[kReading] && !consume.reading) {
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
    throw new InvalidArgumentError('chunk')
  }

  consume.length += chunk.byteLength
  consume.body.push(chunk)
}

function consumeReadMore (consume) {
  if (consume.parent[kReading]) {
    consume.reading = false
    return
  }

  consume.pushed = true
  while (consume.pushed) {
    consume.pushed = false
    consume.parent._read(consume.parent)
  }

  consume.reading = false
}

function consumeFinish (consume, err) {
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
