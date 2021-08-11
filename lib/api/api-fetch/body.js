'use strict'

const util = require('../../core/util')
const { kState } = require('./symbols')
const { Blob } = require('buffer')
const { NotSupportedError } = require('../../core/errors')
const assert = require('assert')

let ReadableStream

// https://fetch.spec.whatwg.org/#concept-bodyinit-extract
function extractBody (body) {
  // TODO: FormBody

  let stream = null
  let source = null
  let length = null
  let type = null

  if (body == null) {
    return [null, null]
  } else if (body instanceof URLSearchParams) {
    // spec says to run application/x-www-form-urlencoded on body.list
    // this is implemented in Node.js as apart of an URLSearchParams instance toString method
    // See: https://github.com/nodejs/node/blob/e46c680bf2b211bbd52cf959ca17ee98c7f657f5/lib/internal/url.js#L490
    // and https://github.com/nodejs/node/blob/e46c680bf2b211bbd52cf959ca17ee98c7f657f5/lib/internal/url.js#L1100
    source = body.toString()
    length = Buffer.byteLength(source)
    type = 'application/x-www-form-urlencoded;charset=UTF-8'
  } else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    if (body instanceof DataView) {
      // TODO: Blob doesn't seem to work with DataView?
      body = body.buffer
    }
    source = body
    length = Buffer.byteLength(body)
  } else if (util.isBlob(body)) {
    source = body
    length = body.size
    type = body.type
  } else if (typeof body.pipeThrough === 'function') {
    if (util.isDisturbed(body)) {
      throw new TypeError('disturbed')
    }

    if (body.locked) {
      throw new TypeError('locked')
    }

    stream = body
  } else {
    source = String(body)
    length = Buffer.byteLength(source)
    type = 'text/plain;charset=UTF-8'
  }

  if (!stream) {
    assert(source !== null)
    if (!ReadableStream) {
      ReadableStream = require('stream/web').ReadableStream
    }
    stream = new ReadableStream({
      async start (controller) {
        controller.enqueue(source)
        controller.close()
      },
      async pull () {
      },
      async cancel (reason) {
      }
    })
  }

  return [{ stream, source, length }, type]
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

function safelyExtractBody (body) {
  if (util.isDisturbed(body)) {
    throw new TypeError('disturbed')
  }

  if (body && body.locked) {
    throw new TypeError('locked')
  }

  return extractBody(body)
}

const methods = {
  async blob () {
    const chunks = []

    if (this[kState].body) {
      if (this.bodyUsed || this[kState].body.stream.locked) {
        throw new TypeError('unusable')
      }

      this[kState].bodyUsed = true
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
      return this[kState].body && (
        util.isDisturbed(this[kState].body.stream) ||
        !!this[kState].bodyUsed
      )
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
