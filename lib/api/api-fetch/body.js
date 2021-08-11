'use strict'

const util = require('../../core/util')
const { kState } = require('./symbols')
const { Blob } = require('buffer')
const { NotSupportedError } = require('../../core/errors')
const { ReadableStream } = require('stream/web')
const { kBodyUsed } = require('../../core/symbols')

// https://fetch.spec.whatwg.org/#concept-bodyinit-extract
function extractBody (object, keepalive = false) {
  // 1. Let stream be object if object is a ReadableStream object.
  // Otherwise, let stream be a new ReadableStream, and set up stream.
  let stream = object
  let controller
  if (!stream || typeof stream.pipeThrough !== 'function') {
    stream = new ReadableStream({
      async start (c) {
        controller = c
      },
      async pull () {
      },
      async cancel (reason) {
      }
    })
  }

  // 2. Let action be null.
  let action = null

  // 3. Let source be null.
  let source = null

  // 4. Let length be null.
  let length = null

  // 5. Let Content-Type be null.
  let type = null

  // 6. Switch on object:
  if (object instanceof URLSearchParams) {
    // spec says to run application/x-www-form-urlencoded on body.list
    // this is implemented in Node.js as apart of an URLSearchParams instance toString method
    // See: https://github.com/nodejs/node/blob/e46c680bf2b211bbd52cf959ca17ee98c7f657f5/lib/internal/url.js#L490
    // and https://github.com/nodejs/node/blob/e46c680bf2b211bbd52cf959ca17ee98c7f657f5/lib/internal/url.js#L1100

    // Set source to the result of running the application/x-www-form-urlencoded serializer with object’s list.
    source = object.toString()

    // Set Content-Type to `application/x-www-form-urlencoded;charset=UTF-8`.
    type = 'application/x-www-form-urlencoded;charset=UTF-8'
  } else if (object instanceof ArrayBuffer || ArrayBuffer.isView(object)) {
    if (object instanceof DataView) {
      // TODO: Blob doesn't seem to work with DataView?
      object = object.buffer
    }

    // Set source to a copy of the bytes held by object.
    source = util.isBuffer(object)
      ? Buffer.from(object) // Buffer.slice references same memory.
      : object.slice(0)
  } else if (object instanceof Blob) {
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

    // If object’s type attribute is not the empty byte sequence, set Content-Type to its value.
    if (object.type) {
      type = object.type
    }
  } else if (typeof object.pipeThrough === 'function') {
    // If keepalive is true, then throw a TypeError.
    if (keepalive) {
      throw new TypeError('keepalive')
    }

    // If object is disturbed or locked, then throw a TypeError.
    if (util.isDisturbed(stream)) {
      throw new TypeError('disturbed')
    }

    if (stream.locked) {
      throw new TypeError('locked')
    }
  } else if (typeof object === 'string') {
    source = object
    type = 'text/plain;charset=UTF-8'
  } else {
    // TODO: byte sequence?
    // TODO: FormData?
    // TODO: else?
    source = String(object)
    type = 'text/plain;charset=UTF-8'
  }

  // 7. If source is a byte sequence, then set action to a
  // step that returns source and length to source’s length.
  // TODO: What is a "byte sequence?"
  if (typeof source === 'string') {
    length = Buffer.byteLength(source)
  }

  // 8. If action is non-null, then run these steps in in parallel:
  if (action !== null) {
    // Run action.
    action(bytes => {
      // Whenever one or more bytes are available and stream is not errored,
      // enqueue a Uint8Array wrapping an ArrayBuffer containing the available
      // bytes into stream.
      controller.enqueue(new Uint8Array(bytes))
    }, err => {
      // TODO: Spec doesn't say anything about this?
      controller.error(err)
    }, () => {
      // When running action is done, close stream.
      controller.close()
    })
  } else if (controller) {
    // TODO: Spec doesn't say anything about this?
    controller.enqueue(source)
    controller.close()
  }

  // 9. Let body be a body whose stream is stream, source is source,
  // and length is length.
  const body = { stream, source, length }

  // 10. Return body and Content-Type.
  return [body, type]
}

function cloneBody (src) {
  if (!src) {
    return
  }

  if (util.isDisturbed(src)) {
    throw new TypeError('disturbed')
  }

  if (src.locked) {
    throw new TypeError('locked')
  }

  // https://fetch.spec.whatwg.org/#concept-body-clone
  const [out1, out2] = src.stream.tee()
  src.stream = out1
  return {
    stream: out2,
    length: src.length,
    source: src.source
  }
}

function safelyExtractBody (body, keepalive = false) {
  if (util.isDisturbed(body)) {
    throw new TypeError('disturbed')
  }

  if (body && body.locked) {
    throw new TypeError('locked')
  }

  return extractBody(body, keepalive)
}

const methods = {
  async blob () {
    const chunks = []

    if (this[kState].body) {
      if (this.bodyUsed || this[kState].body.stream.locked) {
        throw new TypeError('unusable')
      }

      // NOTE: stream.isDisturbed hasn't landed on Node 16.x yet.
      this[kState].body.stream[kBodyUsed] = true

      for await (const chunk of this[kState].body.stream) {
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

function mixinBody (prototype) {
  Object.assign(prototype, methods)
  Object.defineProperties(prototype, properties)
}

module.exports = {
  extractBody,
  safelyExtractBody,
  cloneBody,
  mixinBody
}
