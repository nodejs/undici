'use strict'

const util = require('../../core/util')
const {
  ReadableStreamFrom,
  readableStreamClose,
  fullyReadBody,
  extractMimeType
} = require('./util')
const { FormData, setFormDataState, getFormDataBoundary } = require('./formdata')
const { webidl } = require('../webidl')
const assert = require('node:assert')
const { isErrored, isDisturbed } = require('node:stream')
const { isUint8Array } = require('node:util/types')
const { serializeAMimeType } = require('./data-url')
const { multipartFormDataParser } = require('./formdata-parser')
const { parseJSONFromBytes } = require('../infra')
const { utf8DecodeBytes } = require('../../encoding')

const textEncoder = new TextEncoder()
function noop () {}

const streamRegistry = new FinalizationRegistry((weakRef) => {
  const stream = weakRef.deref()
  if (stream && !stream.locked && !isDisturbed(stream) && !isErrored(stream)) {
    stream.cancel('Response object has been garbage collected').catch(noop)
  }
})

/**
 * Extract a body with type from a byte sequence or BodyInit object
 *
 * @param {import('../../../types').BodyInit} object - The BodyInit object to extract from
 * @param {boolean} [keepalive=false] - If true, indicates that the body
 * @returns {[{stream: ReadableStream, source: any, length: number | null}, string | null]} - Returns a tuple containing the body and its type
 *
 * @see https://fetch.spec.whatwg.org/#concept-bodyinit-extract
 */
// When `lazyByteStream` is true, byte-sequence sources (string / Uint8Array)
// are wrapped in a lazy body whose ReadableStream is only built when the body
// is read or its `body` getter is observed — see `makeLazyByteStreamBody`.
// This avoids constructing a ReadableStream (and its controller) for the
// common case where a Request/Response body is consumed directly (e.g. via
// `.text()`) and the stream is never touched.
function extractBody (object, keepalive = false, lazyByteStream = false) {
  // 1. Let stream be null.
  let stream = null
  let controller = null

  // Step 4 (otherwise: set up a new byte ReadableStream) is deferred behind
  // this helper so the stream is only created once we know it's needed. For a
  // lazy byte stream we skip it entirely and hand the source to the body.
  const makeStream = () => {
    stream = new ReadableStream({
      pull () {},
      start (c) {
        controller = c
      },
      cancel () {},
      type: 'bytes'
    })
    return stream
  }

  // 2. If object is a ReadableStream object, then set stream to object.
  if (webidl.is.ReadableStream(object)) {
    stream = object
  } else if (webidl.is.Blob(object)) {
    // 3. Otherwise, if object is a Blob object, set stream to the
    //    result of running object’s get stream.
    stream = object.stream()
  }

  // 5. Assert: stream is a ReadableStream object.
  // `stream` may legitimately be null here: for non-stream/non-Blob sources we
  // no longer eagerly create it (see makeStream above), so only assert when set.
  assert(stream === null || webidl.is.ReadableStream(stream))

  // 6. Let action be null.
  let action = null

  // 7. Let source be null.
  let source = null

  // 8. Let length be null.
  let length = null

  // 9. Let type be null.
  let type = null

  // 10. Switch on object:
  if (typeof object === 'string') {
    // Set source to the UTF-8 encoding of object.
    // Note: setting source to a Uint8Array here breaks some mocking assumptions.
    source = object

    // Set type to `text/plain;charset=UTF-8`.
    type = 'text/plain;charset=UTF-8'
  } else if (webidl.is.URLSearchParams(object)) {
    // URLSearchParams

    // spec says to run application/x-www-form-urlencoded on body.list
    // this is implemented in Node.js as apart of an URLSearchParams instance toString method
    // See: https://github.com/nodejs/node/blob/e46c680bf2b211bbd52cf959ca17ee98c7f657f5/lib/internal/url.js#L490
    // and https://github.com/nodejs/node/blob/e46c680bf2b211bbd52cf959ca17ee98c7f657f5/lib/internal/url.js#L1100

    // Set source to the result of running the application/x-www-form-urlencoded serializer with object’s list.
    source = object.toString()

    // Set type to `application/x-www-form-urlencoded;charset=UTF-8`.
    type = 'application/x-www-form-urlencoded;charset=UTF-8'
  } else if (webidl.is.BufferSource(object)) {
    // Set source to a copy of the bytes held by object.
    source = webidl.util.getCopyOfBytesHeldByBufferSource(object)
  } else if (webidl.is.FormData(object)) {
    const boundary = getFormDataBoundary(object)
    const prefix = `--${boundary}\r\nContent-Disposition: form-data`

    /*! formdata-polyfill. MIT License. Jimmy Wärting <https://jimmy.warting.se/opensource> */
    const formdataEscape = (str) =>
      str.replace(/\n/g, '%0A').replace(/\r/g, '%0D').replace(/"/g, '%22')
    const normalizeLinefeeds = (value) => value.replace(/\r?\n|\r/g, '\r\n')

    // Set action to this step: run the multipart/form-data
    // encoding algorithm, with object’s entry list and UTF-8.
    // - This ensures that the body is immutable and can't be changed afterwords
    // - That the content-length is calculated in advance.
    // - And that all parts are pre-encoded and ready to be sent.

    const blobParts = []
    const rn = new Uint8Array([13, 10]) // '\r\n'
    length = 0
    let hasUnknownSizeValue = false

    for (const [name, value] of object) {
      if (typeof value === 'string') {
        const chunk = textEncoder.encode(prefix +
          `; name="${formdataEscape(normalizeLinefeeds(name))}"` +
          `\r\n\r\n${normalizeLinefeeds(value)}\r\n`)
        blobParts.push(chunk)
        length += chunk.byteLength
      } else {
        const chunk = textEncoder.encode(`${prefix}; name="${formdataEscape(normalizeLinefeeds(name))}"` +
          (value.name ? `; filename="${formdataEscape(value.name)}"` : '') + '\r\n' +
          `Content-Type: ${
            value.type || 'application/octet-stream'
          }\r\n\r\n`)
        blobParts.push(chunk, value, rn)
        if (typeof value.size === 'number') {
          length += chunk.byteLength + value.size + rn.byteLength
        } else {
          hasUnknownSizeValue = true
        }
      }
    }

    // CRLF is appended to the body to function with legacy servers and match other implementations.
    // https://github.com/curl/curl/blob/3434c6b46e682452973972e8313613dfa58cd690/lib/mime.c#L1029-L1030
    // https://github.com/form-data/form-data/issues/63
    const chunk = textEncoder.encode(`--${boundary}--\r\n`)
    blobParts.push(chunk)
    length += chunk.byteLength
    if (hasUnknownSizeValue) {
      length = null
    }

    // Set source to object.
    source = object

    action = async function * () {
      for (const part of blobParts) {
        if (part.stream) {
          yield * part.stream()
        } else {
          yield part
        }
      }
    }

    // Set type to `multipart/form-data; boundary=`,
    // followed by the multipart/form-data boundary string generated
    // by the multipart/form-data encoding algorithm.
    type = `multipart/form-data; boundary=${boundary}`
  } else if (webidl.is.Blob(object)) {
    // Blob

    // Set source to object.
    source = object

    // Set length to object’s size.
    length = object.size

    // If object’s type attribute is not the empty byte sequence, set
    // type to its value.
    if (object.type) {
      type = object.type
    }
  } else if (typeof object[Symbol.asyncIterator] === 'function') {
    // If keepalive is true, then throw a TypeError.
    if (keepalive) {
      throw new TypeError('keepalive')
    }

    // If object is disturbed or locked, then throw a TypeError.
    if (util.isDisturbed(object) || object.locked) {
      throw new TypeError(
        'Response body object should not be disturbed or locked'
      )
    }

    stream =
      webidl.is.ReadableStream(object) ? object : ReadableStreamFrom(object)
  }

  // 11. If source is a byte sequence, then set action to a
  // step that returns source and length to source’s length.
  if (typeof source === 'string' || isUint8Array(source)) {
    action = () => {
      length = typeof source === 'string' ? Buffer.byteLength(source) : source.length
      return source
    }
  }

  // 12. If action is non-null, then run these steps in parallel:
  if (action != null) {
    // Fast path: for a fully-buffered byte source we already hold every byte,
    // so there is no work to run "in parallel". Defer both the stream and the
    // enqueue/close dance to first read by returning a lazy body instead.
    if (lazyByteStream && (typeof source === 'string' || isUint8Array(source))) {
      return [makeLazyByteStreamBody(source), type]
    }

    // Otherwise build the stream now and pump the action's bytes into it.
    const runAction = () => {
      ;(async () => {
        // 1. Run action.
        const result = action()

        // 2. Whenever one or more bytes are available and stream is not
        //    errored, enqueue the result of creating a Uint8Array from the
        //    available bytes into stream.
        const iterator = result?.[Symbol.asyncIterator]?.()
        if (iterator) {
          for await (const bytes of iterator) {
            if (isErrored(stream)) break
            if (bytes.length) {
              controller.enqueue(new Uint8Array(bytes))
            }
          }
        } else if (result?.length && !isErrored(stream)) {
          controller.enqueue(typeof result === 'string' ? textEncoder.encode(result) : new Uint8Array(result))
        }

        // 3. When running action is done, close stream.
        queueMicrotask(() => readableStreamClose(controller))
      })()
    }

    makeStream()
    runAction()
  }

  // 13. Let body be a body whose stream is stream, source is source,
  // and length is length.
  const body = { stream, source, length }

  // 14. Return (body, type).
  return [body, type]
}

/**
 * @typedef {object} ExtractBodyResult
 * @property {ReadableStream<Uint8Array<ArrayBuffer>>} stream - The ReadableStream containing the body data
 * @property {any} source - The original source of the body data
 * @property {number | null} length - The length of the body data, or null
 */

/**
 * Safely extract a body with type from a byte sequence or BodyInit object.
 *
 * @param {import('../../../types').BodyInit} object - The BodyInit object to extract from
 * @param {boolean} [keepalive=false] - If true, indicates that the body
 * @returns {[ExtractBodyResult, string | null]} - Returns a tuple containing the body and its type
 *
 * @see https://fetch.spec.whatwg.org/#bodyinit-safely-extract
 */
function safelyExtractBody (object, keepalive = false) {
  // To safely extract a body and a `Content-Type` value from
  // a byte sequence or BodyInit object object, run these steps:

  // 1. If object is a ReadableStream object, then:
  if (webidl.is.ReadableStream(object)) {
    // Assert: object is neither disturbed nor locked.
    assert(!util.isDisturbed(object), 'The body has already been consumed.')
    assert(!object.locked, 'The stream is locked.')
  }

  // 2. Return the results of extracting object.
  return extractBody(object, keepalive)
}

// Construct a byte-sequence body without creating its ReadableStream up front.
// The source bytes are fully buffered, so the spec's stream is purely an
// observation surface here: consumers that read the body directly (`.text()`,
// `.arrayBuffer()`, …) read `source` and never touch the stream. The stream is
// only built — and the bytes enqueued and closed — the first time `getStream`
// is called, i.e. when `.body` is actually observed.
function makeLazyByteStreamBody (source) {
  let stream = null
  let controller = null
  const length = typeof source === 'string' ? Buffer.byteLength(source) : source.length

  const getStream = () => {
    if (stream !== null) {
      return stream
    }

    stream = new ReadableStream({
      pull () {},
      start (c) {
        controller = c
      },
      cancel () {},
      type: 'bytes'
    })

    // Enqueue the whole buffered source and close on a microtask, mirroring the
    // eager byte-stream path in extractBody so observable behaviour is identical.
    if (source.length) {
      controller.enqueue(typeof source === 'string' ? textEncoder.encode(source) : new Uint8Array(source))
    }
    queueMicrotask(() => readableStreamClose(controller))
    return stream
  }

  return {
    // `stream` starts null and is filled in lazily by getStream(); callers must
    // go through getStream() (or the `body` getters) rather than reading it.
    stream: null,
    getStream,
    source,
    length
  }
}

function cloneBody (body) {
  // To clone a body body, run these steps:

  // https://fetch.spec.whatwg.org/#concept-body-clone

  // 1. Let « out1, out2 » be the result of teeing body’s stream.
  const stream = body.stream ?? (body.stream = body.getStream())
  const { 0: out1, 1: out2 } = stream.tee()

  // 2. Set body’s stream to out1.
  body.stream = out1

  // 3. Return a body whose stream is out2 and other members are copied from body.
  return {
    stream: out2,
    length: body.length,
    source: body.source
  }
}

function bytesToArrayBuffer (bytes) {
  return new Uint8Array(bytes).buffer
}

function bytesToUint8Array (bytes) {
  return new Uint8Array(bytes)
}

function bodyMixinMethods (instance, getInternalState) {
  const methods = {
    blob () {
      // The blob() method steps are to return the result of
      // running consume body with this and the following step
      // given a byte sequence bytes: return a Blob whose
      // contents are bytes and whose type attribute is this’s
      // MIME type.
      return consumeBody(this, (bytes) => {
        let mimeType = bodyMimeType(getInternalState(this))

        if (mimeType === null) {
          mimeType = ''
        } else if (mimeType) {
          mimeType = serializeAMimeType(mimeType)
        }

        // Return a Blob whose contents are bytes and type attribute
        // is mimeType.
        return new Blob([bytes], { type: mimeType })
      }, instance, getInternalState)
    },

    arrayBuffer () {
      // The arrayBuffer() method steps are to return the result
      // of running consume body with this and the following step
      // given a byte sequence bytes: return a new ArrayBuffer
      // whose contents are bytes.
      return consumeBody(this, bytesToArrayBuffer, instance, getInternalState)
    },

    text () {
      // The text() method steps are to return the result of running
      // consume body with this and UTF-8 decode.
      return consumeBody(this, utf8DecodeBytes, instance, getInternalState)
    },

    json () {
      // The json() method steps are to return the result of running
      // consume body with this and parse JSON from bytes.
      return consumeBody(this, parseJSONFromBytes, instance, getInternalState)
    },

    formData () {
      // The formData() method steps are to return the result of running
      // consume body with this and the following step given a byte sequence bytes:
      return consumeBody(this, (value) => {
        // 1. Let mimeType be the result of get the MIME type with this.
        const mimeType = bodyMimeType(getInternalState(this))

        // 2. If mimeType is non-null, then switch on mimeType’s essence and run
        //    the corresponding steps:
        if (mimeType !== null) {
          switch (mimeType.essence) {
            case 'multipart/form-data': {
              // 1. ... [long step]
              // 2. If that fails for some reason, then throw a TypeError.
              const parsed = multipartFormDataParser(value, mimeType)

              // 3. Return a new FormData object, appending each entry,
              //    resulting from the parsing operation, to its entry list.
              const fd = new FormData()
              setFormDataState(fd, parsed)

              return fd
            }
            case 'application/x-www-form-urlencoded': {
              // 1. Let entries be the result of parsing bytes.
              const entries = new URLSearchParams(value.toString())

              // 2. If entries is failure, then throw a TypeError.

              // 3. Return a new FormData object whose entry list is entries.
              const fd = new FormData()

              for (const [name, value] of entries) {
                fd.append(name, value)
              }

              return fd
            }
          }
        }

        // 3. Throw a TypeError.
        throw new TypeError(
          'Content-Type was not one of "multipart/form-data" or "application/x-www-form-urlencoded".'
        )
      }, instance, getInternalState)
    },

    bytes () {
      // The bytes() method steps are to return the result of running consume body
      // with this and the following step given a byte sequence bytes: return the
      // result of creating a Uint8Array from bytes in this’s relevant realm.
      return consumeBody(this, bytesToUint8Array, instance, getInternalState)
    }
  }

  return methods
}

function mixinBody (prototype, getInternalState) {
  Object.assign(prototype.prototype, bodyMixinMethods(prototype, getInternalState))
}

/**
 * @see https://fetch.spec.whatwg.org/#concept-body-consume-body
 * @param {any} object internal state
 * @param {(value: unknown) => unknown} convertBytesToJSValue
 * @param {any} instance
 * @param {(target: any) => any} getInternalState
 */
function consumeBody (object, convertBytesToJSValue, instance, getInternalState) {
  try {
    webidl.brandCheck(object, instance)
  } catch (e) {
    return Promise.reject(e)
  }

  object = getInternalState(object)

  // 1. If object is unusable, then return a promise rejected
  //    with a TypeError.
  if (bodyUnusable(object)) {
    return Promise.reject(new TypeError('Body is unusable: Body has already been read'))
  }

  // Fast paths for bodies that can convert their buffered bytes directly,
  // skipping the ReadableStream.
  // These `consume*` hooks are optional extension points an embedder (e.g.
  // Node.js) can put on a body whose stream has not been materialized; undici's
  // own lazy bodies don't define them, so these branches are simply skipped
  // here. We compare `convertBytesToJSValue` by reference against the hoisted
  // converters to pick the matching hook, and mark the body consumed so a
  // second read correctly throws.
  if (object.body != null &&
      object.body.stream == null &&
      object.body.consumeArrayBuffer != null &&
      convertBytesToJSValue === bytesToArrayBuffer) {
    object.body.consumed = true
    return object.body.consumeArrayBuffer()
  }

  if (object.body != null &&
      object.body.stream == null &&
      object.body.consumeUint8Array != null &&
      convertBytesToJSValue === bytesToUint8Array) {
    object.body.consumed = true
    return object.body.consumeUint8Array()
  }

  // 2. Let promise be a new promise.
  const promise = Promise.withResolvers()

  // 3. Let errorSteps given error be to reject promise with error.
  const errorSteps = promise.reject

  // 4. Let successSteps given a byte sequence data be to resolve
  //    promise with the result of running convertBytesToJSValue
  //    with data. If that threw an exception, then run errorSteps
  //    with that exception.
  const successSteps = (data) => {
    try {
      promise.resolve(convertBytesToJSValue(data))
    } catch (e) {
      errorSteps(e)
    }
  }

  // 5. If object’s body is null, then run successSteps with an
  //    empty byte sequence.
  if (object.body == null) {
    successSteps(Buffer.allocUnsafe(0))
    return promise.promise
  }

  // Generic direct-consume hook (any convertBytesToJSValue), same idea as the
  // typed fast paths above: let an embedder yield the buffered bytes without a
  // stream. successSteps still applies the requested conversion to them.
  if (object.body.stream == null && object.body.consumeBytes != null) {
    object.body.consumed = true
    object.body.consumeBytes().then(successSteps, errorSteps)
    return promise.promise
  }

  // No fast path applied: materialize the lazy body's stream so it can be read.
  if (object.body.stream == null) {
    object.body.stream = object.body.getStream()
  }

  // 6. Otherwise, fully read object’s body given successSteps,
  //    errorSteps, and object’s relevant global object.
  fullyReadBody(object.body, successSteps, errorSteps)

  // 7. Return promise.
  return promise.promise
}

/**
 * @see https://fetch.spec.whatwg.org/#body-unusable
 * @param {any} object internal state
 */
function bodyUnusable (object) {
  const body = object.body

  // An object including the Body interface mixin is
  // said to be unusable if its body is non-null and
  // its body’s stream is disturbed or locked.
  // A lazy body that was consumed via a fast path (above) has its stream null
  // but is still unusable, so check the `consumed` flag first; only inspect the
  // stream once it has actually been materialized.
  return body != null && (body.consumed === true ||
    (body.stream != null &&
      (body.stream.locked || util.isDisturbed(body.stream))))
}

/**
 * @see https://fetch.spec.whatwg.org/#concept-body-mime-type
 * @param {any} requestOrResponse internal state
 */
function bodyMimeType (requestOrResponse) {
  // 1. Let headers be null.
  // 2. If requestOrResponse is a Request object, then set headers to requestOrResponse’s request’s header list.
  // 3. Otherwise, set headers to requestOrResponse’s response’s header list.
  // The header list may be lazily initialized (null until first needed, see
  // request.js); materialize and cache it on demand before extracting from it.
  /** @type {import('./headers').HeadersList} */
  const headers = requestOrResponse.headersList === null
    ? (requestOrResponse.headersList = requestOrResponse.getHeadersList())
    : requestOrResponse.headersList

  // 4. Let mimeType be the result of extracting a MIME type from headers.
  const mimeType = extractMimeType(headers)

  // 5. If mimeType is failure, then return null.
  if (mimeType === 'failure') {
    return null
  }

  // 6. Return mimeType.
  return mimeType
}

module.exports = {
  extractBody,
  safelyExtractBody,
  makeLazyByteStreamBody,
  cloneBody,
  mixinBody,
  streamRegistry,
  bodyUnusable
}
