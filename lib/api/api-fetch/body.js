'use strict'

const util = require('../../core/util')
const { Readable } = require('stream')

let TransformStream

// https://fetch.spec.whatwg.org/#concept-bodyinit-extract
function extractBody (body) {
  // TODO: FormBody

  if (body == null) {
    return [null, null]
  } else if (body instanceof URLSearchParams) {
    // spec says to run application/x-www-form-urlencoded on body.list
    // this is implemented in Node.js as apart of an URLSearchParams instance toString method
    // See: https://github.com/nodejs/node/blob/e46c680bf2b211bbd52cf959ca17ee98c7f657f5/lib/internal/url.js#L490
    // and https://github.com/nodejs/node/blob/e46c680bf2b211bbd52cf959ca17ee98c7f657f5/lib/internal/url.js#L1100
    return [{
      source: body.toString()
    }, 'application/x-www-form-urlencoded;charset=UTF-8']
  } else if (typeof body === 'string') {
    return [{
      source: body
    }, 'text/plain;charset=UTF-8']
  } else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return [{
      source: body
    }, null]
  } else if (util.isBlob(body)) {
    return [{
      source: body,
      length: body.size
    }, body.type || null]
  } else if (util.isStream(body) || typeof body.pipeThrough === 'function') {
    if (util.isDisturbed(body)) {
      throw new TypeError('disturbed')
    }

    let stream
    if (util.isStream(body)) {
      stream = Readable.toWeb(body)
    } else {
      if (body.locked) {
        throw new TypeError('locked')
      }

      if (!TransformStream) {
        TransformStream = require('stream/web').TransformStream
      }

      // https://streams.spec.whatwg.org/#readablestream-create-a-proxy
      const identityTransform = new TransformStream()
      body.pipeThrough(identityTransform)
      stream = identityTransform
    }

    return [{
      stream
    }, null]
  } else {
    throw Error('Cannot extract Body from input: ', body)
  }
}

module.exports = { extractBody }
