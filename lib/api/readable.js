// Ported from https://github.com/nodejs/undici/pull/907

'use strict'

const assert = require('node:assert')
const { Readable } = require('node:stream')
const { RequestAbortedError, NotSupportedError, InvalidArgumentError, AbortError } = require('../core/errors')
const util = require('../core/util')
const { ReadableStreamFrom } = require('../core/util')

const noop = () => {}

const kConsuming = Symbol('kConsuming')
const kBytesConsumed = Symbol('kBytesConsumed')
const kConsumeBodyChunks = Symbol('kConsumeBodyChunks')
const kConsumeResolve = Symbol('kConsumeResolve')
const kConsumeReject = Symbol('kConsumeReject')
const kConsumeType = Symbol('kConsumeType')

const kReading = Symbol('kReading')
const kBody = Symbol('kBody')
const kAbort = Symbol('kAbort')
const kContentType = Symbol('kContentType')
const kContentLength = Symbol('kContentLength')
const kUsed = Symbol('kUsed')
const kBytesRead = Symbol('kBytesRead')

/**
 * @class
 * @extends {Readable}
 * @see https://fetch.spec.whatwg.org/#body
 */
class BodyReadable extends Readable {
  /**
   * @param {object} opts
   * @param {(this: Readable, size: number) => void} opts.resume
   * @param {() => (void | null)} opts.abort
   * @param {string} [opts.contentType = '']
   * @param {number} [opts.contentLength]
   * @param {number} [opts.highWaterMark = 64 * 1024]
   */
  constructor ({
    resume,
    abort,
    contentType = '',
    contentLength,
    highWaterMark = 64 * 1024 // Same as nodejs fs streams.
  }) {
    super({
      autoDestroy: true,
      read: resume,
      highWaterMark
    })

    this._readableState.dataEmitted = false

    this[kAbort] = abort

    this[kConsuming] = false
    this[kBytesConsumed] = 0
    this[kConsumeBodyChunks] = null
    this[kConsumeResolve] = null
    this[kConsumeReject] = null
    this[kConsumeType] = null

    this[kBytesRead] = 0
    /**
     * @type {ReadableStream|null}
     */
    this[kBody] = null
    this[kUsed] = false
    this[kContentType] = contentType
    this[kContentLength] = Number.isFinite(contentLength) ? contentLength : null

    // Is stream being consumed through Readable API?
    // This is an optimization so that we avoid checking
    // for 'data' and 'readable' listeners in the hot path
    // inside push().
    this[kReading] = false
  }

  /**
   * @param {Error|null} err
   * @param {(error:(Error|null)) => void} callback
   * @returns {void}
   */
  _destroy (err, callback) {
    if (!err && !this._readableState.endEmitted) {
      err = new RequestAbortedError()
    }

    if (err) {
      this[kAbort]()
    }

    // Workaround for Node "bug". If the stream is destroyed in same
    // tick as it is created, then a user who is waiting for a
    // promise (i.e micro tick) for installing a 'error' listener will
    // never get a chance and will always encounter an unhandled exception.
    if (!this[kUsed]) {
      setImmediate(() => {
        callback(err)
      })
    } else {
      callback(err)
    }
  }

  /**
   * @param {string} event
   * @param {(...args: any[]) => void} listener
   * @returns {this}
   */
  on (event, listener) {
    if (event === 'data' || event === 'readable') {
      this[kReading] = true
      this[kUsed] = true
    }
    return super.on(event, listener)
  }

  /**
   * @param {string} event
   * @param {(...args: any[]) => void} listener
   * @returns {this}
   */
  addListener (event, listener) {
    return this.on(event, listener)
  }

  /**
   * @param {string|symbol} event
   * @param {(...args: any[]) => void} listener
   * @returns {this}
   */
  off (event, listener) {
    const ret = super.off(event, listener)
    if (event === 'data' || event === 'readable') {
      this[kReading] = (
        this.listenerCount('data') > 0 ||
        this.listenerCount('readable') > 0
      )
    }
    return ret
  }

  /**
   * @param {string|symbol} event
   * @param {(...args: any[]) => void} listener
   * @returns {this}
   */
  removeListener (event, listener) {
    return this.off(event, listener)
  }

  /**
   * @param {Buffer|null} chunk
   * @returns {boolean}
   */
  push (chunk) {
    this[kBytesRead] += chunk ? chunk.length : 0

    if (this[kConsuming] && chunk !== null) {
      this.#consumePush(chunk)
      return this[kReading] ? super.push(chunk) : true
    }
    return super.push(chunk)
  }

  /**
   * Consumes and returns the body as a string.
   *
   * @see https://fetch.spec.whatwg.org/#dom-body-text
   * @returns {Promise<string>}
   */
  async text () {
    return this.#consume('text')
  }

  /**
   * Consumes and returns the body as a JavaScript Object.
   *
   * @see https://fetch.spec.whatwg.org/#dom-body-json
   * @returns {Promise<unknown>}
   */
  async json () {
    return this.#consume('json')
  }

  /**
   * Consumes and returns the body as a Blob
   *
   * @see https://fetch.spec.whatwg.org/#dom-body-blob
   * @returns {Promise<Blob>}
   */
  async blob () {
    return this.#consume('blob')
  }

  /**
   * Consumes and returns the body as an Uint8Array.
   *
   * @see https://fetch.spec.whatwg.org/#dom-body-bytes
   * @returns {Promise<Uint8Array>}
   */
  async bytes () {
    return this.#consume('bytes')
  }

  /**
   * Consumes and returns the body as an ArrayBuffer.
   *
   * @see https://fetch.spec.whatwg.org/#dom-body-arraybuffer
   * @returns {Promise<ArrayBuffer>}
   */
  async arrayBuffer () {
    return this.#consume('arrayBuffer')
  }

  /**
   * Not implemented
   *
   * @see https://fetch.spec.whatwg.org/#dom-body-formdata
   * @throws {NotSupportedError}
   */
  async formData () {
    // TODO: Implement.
    throw new NotSupportedError()
  }

  /**
   * Returns true if the body is not null and the body has been consumed.
   * Otherwise, returns false.
   *
   * @see https://fetch.spec.whatwg.org/#dom-body-bodyused
   * @readonly
   * @returns {boolean}
   */
  get bodyUsed () {
    return util.isDisturbed(this)
  }

  /**
   * @see https://fetch.spec.whatwg.org/#dom-body-body
   * @readonly
   * @returns {ReadableStream}
   */
  get body () {
    if (!this[kBody]) {
      this[kBody] = ReadableStreamFrom(this)
      if (this[kConsuming]) {
        // TODO: Is this the best way to force a lock?
        this[kBody].getReader() // Ensure stream is locked.
        assert(this[kBody].locked)
      }
    }
    return this[kBody]
  }

  /**
   * @param {string} type
   * @returns {Promise<any>}
   */
  #consume (type) {
    assert(this[kConsuming] === false)

    return new Promise((resolve, reject) => {
      if (isUnusable(this)) {
        const rState = this._readableState
        if (rState.destroyed && rState.closeEmitted === false) {
          this
            .on('error', reject)
            .on('close', () => {
              reject(new TypeError('unusable'))
            })
        } else {
          reject(rState.errored ?? new TypeError('unusable'))
        }
      } else {
        queueMicrotask(() => {
          this[kConsuming] = true
          this[kConsumeType] = type
          this[kConsumeResolve] = resolve
          this[kConsumeReject] = reject
          this[kConsumeBodyChunks] = []

          this
            .on('error', this.#consumeFinish)
            .on('close', function () {
              if (this[kConsumeBodyChunks] !== null) {
                this.#consumeFinish(new RequestAbortedError())
              }
            })

          this.#consumeStart()
        })
      }
    })
  }

  /**
   * @returns {void}
   */
  #consumeStart () {
    if (this[kConsumeBodyChunks] === null) {
      return
    }

    const state = this._readableState

    if (state.bufferIndex) {
      const start = state.bufferIndex
      const end = state.buffer.length
      for (let n = start; n < end; n++) {
        this.#consumePush(state.buffer[n])
      }
    } else {
      for (const chunk of state.buffer) {
        this.#consumePush(chunk)
      }
    }

    if (state.endEmitted) {
      this.#consumeEnd()
    } else {
      this.on('end', this.#consumeEnd)
    }

    this.resume()

    while (this.read() != null) {
      // Loop
    }
  }

  /**
   * @param {Buffer} chunk
   * @returns {void}
   */
  #consumePush (chunk) {
    this[kBytesConsumed] += chunk.length
    this[kConsumeBodyChunks].push(chunk)
  }

  /**
   * @returns {void}
   */
  #consumeEnd () {
    const { [kConsumeType]: type, [kConsumeBodyChunks]: bodyChunks, [kConsumeResolve]: resolve, [kBytesConsumed]: length } = this
    const encoding = this._readableState.encoding
    try {
      if (type === 'text') {
        resolve(chunksDecode(bodyChunks, length, encoding))
      } else if (type === 'json') {
        resolve(JSON.parse(chunksDecode(bodyChunks, length, encoding)))
      } else if (type === 'arrayBuffer') {
        resolve(chunksConcat(bodyChunks, length).buffer)
      } else if (type === 'blob') {
        resolve(new Blob(bodyChunks, { type: this[kContentType] }))
      } else if (type === 'bytes') {
        resolve(chunksConcat(bodyChunks, length))
      }

      this.#consumeFinish()
    } catch (err) {
      this.destroy(err)
    }
  }

  /**
 * @param {Error} [err]
 * @returns {void}
 */
  #consumeFinish (err) {
    if (this[kConsumeBodyChunks] === null) {
      return
    }

    if (err) {
      this[kConsumeReject](err)
    } else {
      this[kConsumeResolve]()
    }

    // Reset the consume object to allow for garbage collection.
    this[kConsumeType] = null
    this[kConsumeResolve] = null
    this[kConsumeReject] = null
    this[kConsumeBodyChunks] = null
  }

  /**
   * Dumps the response body by reading `limit` number of bytes.
   * @param {object} opts
   * @param {number} [opts.limit = 131072] Number of bytes to read.
   * @param {AbortSignal} [opts.signal] An AbortSignal to cancel the dump.
   * @returns {Promise<null>}
   */
  async dump (opts) {
    const signal = opts?.signal

    if (signal != null && (typeof signal !== 'object' || !('aborted' in signal))) {
      throw new InvalidArgumentError('signal must be an AbortSignal')
    }

    const limit = opts?.limit && Number.isFinite(opts.limit)
      ? opts.limit
      : 128 * 1024

    signal?.throwIfAborted()

    if (this._readableState.closeEmitted) {
      return null
    }

    return await new Promise((resolve, reject) => {
      if (
        (this[kContentLength] && (this[kContentLength] > limit)) ||
        this[kBytesRead] > limit
      ) {
        this.destroy(new AbortError())
      }

      if (signal) {
        const onAbort = () => {
          this.destroy(signal.reason ?? new AbortError())
        }
        signal.addEventListener('abort', onAbort)
        this
          .on('close', function () {
            signal.removeEventListener('abort', onAbort)
            if (signal.aborted) {
              reject(signal.reason ?? new AbortError())
            } else {
              resolve(null)
            }
          })
      } else {
        this.on('close', resolve)
      }

      this
        .on('error', noop)
        .on('data', () => {
          if (this[kBytesRead] > limit) {
            this.destroy()
          }
        })
        .resume()
    })
  }

  /**
   * @param {BufferEncoding} encoding
   * @returns {this}
   */
  setEncoding (encoding) {
    if (Buffer.isEncoding(encoding)) {
      this._readableState.encoding = encoding
    }
    return this
  }
}

/**
 * @see https://streams.spec.whatwg.org/#readablestream-locked
 * @param {BodyReadable} bodyReadable
 * @returns {boolean}
 */
function isLocked (bodyReadable) {
  // Consume is an implicit lock.
  return bodyReadable[kBody]?.locked === true || bodyReadable[kConsuming] === true
}

/**
 * @see https://fetch.spec.whatwg.org/#body-unusable
 * @param {BodyReadable} bodyReadable
 * @returns {boolean}
 */
function isUnusable (bodyReadable) {
  return util.isDisturbed(bodyReadable) || isLocked(bodyReadable)
}

/**
 * @param {Buffer[]} chunks
 * @param {number} length
 * @param {BufferEncoding} encoding
 * @returns {string}
 */
function chunksDecode (chunks, length, encoding) {
  if (chunks.length === 0 || length === 0) {
    return ''
  }
  const buffer = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, length)
  const bufferLength = buffer.length

  // Skip BOM.
  const start =
    bufferLength > 2 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
      ? 3
      : 0
  if (!encoding || encoding === 'utf8' || encoding === 'utf-8') {
    return buffer.utf8Slice(start, bufferLength)
  } else {
    return buffer.subarray(start, bufferLength).toString(encoding)
  }
}

/**
 * @param {Buffer[]} chunks
 * @param {number} length
 * @returns {Uint8Array}
 */
function chunksConcat (chunks, length) {
  if (chunks.length === 0 || length === 0) {
    return new Uint8Array(0)
  }
  if (chunks.length === 1) {
    // fast-path
    return new Uint8Array(chunks[0])
  }
  const buffer = new Uint8Array(Buffer.allocUnsafeSlow(length).buffer)

  let offset = 0
  for (let i = 0; i < chunks.length; ++i) {
    const chunk = chunks[i]
    buffer.set(chunk, offset)
    offset += chunk.length
  }

  return buffer
}

module.exports = {
  Readable: BodyReadable,
  chunksDecode
}
