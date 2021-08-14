'use strict'

const util = require('../core/util')
const { toWebReadable } = require('./util')
const { kState } = require('./symbols')
const { Blob } = require('buffer')
const { Readable } = require('stream')
const { NotSupportedError } = require('../core/errors')
const { kBodyUsed } = require('../core/symbols')
const assert = require('assert')
const nodeUtil = require('util')

let ReadableStream

// https://fetch.spec.whatwg.org/#concept-bodyinit-extract
function extractBody (object, keepalive = false) {
  if (!ReadableStream) {
    ReadableStream = require('stream/web').ReadableStream
  }

  // 1. Let stream be object if object is a ReadableStream object.
  // Otherwise, let stream be a new ReadableStream, and set up stream.
  let stream = object
  let controller
  if (!stream || !(stream instanceof ReadableStream)) {
    stream = new ReadableStream({
      async start (c) {
        controller = c
      },
      async pull () {},
      async cancel (reason) {}
    })
  }

  // 2. Let action be null.
  let action = null

  // 3. Let source be null.
  let source = null

  // 4. Let length be null.
  let length = null

  // 5. Let Content-Type be null.
  let contentType = null

  // 6. Switch on object:
  if (object == null) {
    // Note: The IDL processor cannot handle this situation. See
    // https://crbug.com/335871.
  } else if (object instanceof URLSearchParams) {
    // URLSearchParams

    // spec says to run application/x-www-form-urlencoded on body.list
    // this is implemented in Node.js as apart of an URLSearchParams instance toString method
    // See: https://github.com/nodejs/node/blob/e46c680bf2b211bbd52cf959ca17ee98c7f657f5/lib/internal/url.js#L490
    // and https://github.com/nodejs/node/blob/e46c680bf2b211bbd52cf959ca17ee98c7f657f5/lib/internal/url.js#L1100

    // Set source to the result of running the application/x-www-form-urlencoded serializer with object’s list.
    source = object.toString()

    // Set Content-Type to `application/x-www-form-urlencoded;charset=UTF-8`.
    contentType = 'application/x-www-form-urlencoded;charset=UTF-8'
  } else if (object instanceof ArrayBuffer || ArrayBuffer.isView(object)) {
    // BufferSource

    if (object instanceof DataView) {
      // TODO: Blob doesn't seem to work with DataView?
      object = object.buffer
    }

    // Set source to a copy of the bytes held by object.
    source = new Uint8Array(object)
  } else if (object instanceof Blob) {
    // Blob

    // Set action to this step: read object.
    action = async (onNext, onError, onComplete) => {
      try {
        onNext(await object.arrayBuffer())
        onComplete()
      } catch (err) {
        onError(err)
      }
    }

    // Set source to object.
    source = object

    // Set length to object’s size.
    length = object.size

    // If object’s type attribute is not the empty byte sequence, set
    // Content-Type to its value.
    if (object.type) {
      contentType = object.type
    }
  } else if (object instanceof ReadableStream || object instanceof Readable) {
    // ReadableStream

    // If keepalive is true, then throw a TypeError.
    if (keepalive) {
      throw new TypeError('keepalive')
    }

    // If object is disturbed or locked, then throw a TypeError.
    if (util.isDisturbed(stream) || stream.locked) {
      throw new TypeError(
        'Response body object should not be disturbed or locked'
      )
    }

    if (util.isStream(object)) {
      stream = toWebReadable(object)
    }
  } else {
    // TODO: byte sequence?
    // TODO: FormData?
    // TODO: scalar value string?
    // TODO: else?
    source = String(object)
    contentType = 'text/plain;charset=UTF-8'
  }

  // 7. If source is a byte sequence, then set action to a
  // step that returns source and length to source’s length.
  // TODO: What is a "byte sequence?"
  if (typeof source === 'string' || util.isBuffer(source)) {
    length = Buffer.byteLength(source)
  }

  // 8. If action is non-null, then run these steps in in parallel:
  if (action !== null) {
    // Run action.
    action(
      (bytes) => {
        // Whenever one or more bytes are available and stream is not errored,
        // enqueue a Uint8Array wrapping an ArrayBuffer containing the available
        // bytes into stream.
        if (!/state: 'errored'/.test(nodeUtil.inspect(stream))) {
          controller.enqueue(new Uint8Array(bytes))
        }
      },
      (err) => {
        // TODO: Spec doesn't say anything about this?
        controller.error(err)
      },
      () => {
        // When running action is done, close stream.
        controller.close()
      }
    )
  } else if (controller) {
    // TODO: Spec doesn't say anything about this?
    controller.enqueue(source)
    controller.close()
  }

  // 9. Let body be a body whose stream is stream, source is source,
  // and length is length.
  const body = { stream, source, length }

  // 10. Return body and Content-Type.
  return [body, contentType]
}

// https://fetch.spec.whatwg.org/#bodyinit-safely-extract
function safelyExtractBody (object, keepalive = false) {
  if (!ReadableStream) {
    ReadableStream = require('stream/web').ReadableStream
  }

  // To safely extract a body and a `Content-Type` value from
  // a byte sequence or BodyInit object object, run these steps:

  // 1. If object is a ReadableStream object, then:
  if (object instanceof ReadableStream) {
    // Assert: object is neither disturbed nor locked.
    assert(!util.isDisturbed(object), 'disturbed')
    assert(!object.locked, 'locked')
  }

  // 2. Return the results of extracting object.
  return extractBody(object, keepalive)
}

function cloneBody (body) {
  // To clone a body body, run these steps:

  // https://fetch.spec.whatwg.org/#concept-body-clone

  // 1. Let « out1, out2 » be the result of teeing body’s stream.
  const [out1, out2] = body.stream.tee()

  // 2. Set body’s stream to out1.
  body.stream = out1

  // 3. Return a body whose stream is out2 and other members are copied from body.
  return {
    stream: out2,
    length: body.length,
    source: body.source
  }
}

const methods = {
  async blob () {
    const chunks = []

    if (this[kState].body) {
      const stream = this[kState].body.stream

      if (util.isDisturbed(stream)) {
        throw new TypeError('disturbed')
      }

      if (stream.locked) {
        throw new TypeError('locked')
      }

      // NOTE: stream.isDisturbed hasn't landed on Node 16.x yet.
      stream[kBodyUsed] = true

      for await (const chunk of stream) {
        chunks.push(chunk)
      }
    }

    return new Blob(chunks, { type: this.headers.get('Content-Type') || '' })
  },

  async arrayBuffer () {
    const blob = await this.blob()
    return await blob.arrayBuffer()
  },

  async text () {
    const blob = await this.blob()
    return await blob.text()
  },

  async json () {
    return JSON.parse(await this.text())
  },

  async formData () {
    // TODO: Implement.
    throw new NotSupportedError('formData')
  }
}

const properties = {
  body: {
    enumerable: true,
    get () {
      return this[kState].body ? this[kState].body.stream : null
    }
  },
  bodyUsed: {
    enumerable: true,
    get () {
      return this[kState].body && util.isDisturbed(this[kState].body.stream)
    }
  }
}

function cancelBody (body, reason) {
  try {
    if (body.stream) {
      body.stream.cancel(reason)
    }
  } catch (err) {
    // Will throw TypeError if body is not readable.
    if (err.name !== 'TypeError') {
      throw err
    }
  }
}

function mixinBody (prototype) {
  Object.assign(prototype, methods)
  Object.defineProperties(prototype, properties)
}

module.exports = {
  cancelBody,
  extractBody,
  safelyExtractBody,
  cloneBody,
  mixinBody
}
