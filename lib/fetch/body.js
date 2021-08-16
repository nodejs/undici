'use strict'

const util = require('../core/util')
const { toWebReadable } = require('./util')
const { FormData } = require('./formdata')
const { File } = require('./file')
const { kState } = require('./symbols')
const { Blob } = require('buffer')
const { Readable } = require('stream')
const { kBodyUsed } = require('../core/symbols')
const assert = require('assert')
const nodeUtil = require('util')
const Dicer = require('dicer')
const { pipeline: pipelinep } = require('stream/promises')

let ReadableStream

async function * blobGen (blob) {
  if (blob.stream) {
    for await (const chunk of blob.stream()) {
      yield chunk
    }
  } else {
    yield await blob.arrayBuffer()
  }
}

// https://fetch.spec.whatwg.org/#concept-bodyinit-extract
function extractBody (object, keepalive = false) {
  if (!ReadableStream) {
    ReadableStream = require('stream/web').ReadableStream
  }

  // 1. Let stream be object if object is a ReadableStream object.
  // Otherwise, let stream be a new ReadableStream, and set up stream.
  let stream = null

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
  } else if (object instanceof FormData) {
    const boundary = '----formdata-undici-' + Math.random()
    const prefix = `--${boundary}\r\nContent-Disposition: form-data; name="`

    /*! formdata-polyfill. MIT License. Jimmy Wärting <https://jimmy.warting.se/opensource> */
    const escape = (str, filename) =>
      (filename ? str : str.replace(/\r?\n|\r/g, '\r\n'))
        .replace(/\n/g, '%0A')
        .replace(/\r/g, '%0D')
        .replace(/"/g, '%22')

    // Set action to this step: run the multipart/form-data
    // encoding algorithm, with object’s entry list and UTF-8.
    action = async function * () {
      const enc = new TextEncoder()

      for (const [name, value] of object) {
        if (typeof value === 'string') {
          yield enc.encode(
            prefix +
            escape(name) +
            `"\r\n\r\n${value.replace(/\r(?!\n)|(?<!\r)\n/g, '\r\n')}\r\n`
          )
        } else {
          yield enc.encode(
            prefix +
              escape(name) +
              `"; filename="${escape(value.name, 1)}"\r\n` +
              `Content-Type: ${
                value.type || 'application/octet-stream'
              }\r\n\r\n`
          )

          for await (const chunk of blobGen(value)) {
            yield chunk
          }

          yield enc.encode('\r\n')
        }
      }

      yield enc.encode(`--${boundary}--`)
    }

    // Set source to object.
    source = object

    // Set length to unclear, see html/6424 for improving this.
    // TODO

    // Set Content-Type to `multipart/form-data; boundary=`,
    // followed by the multipart/form-data boundary string generated
    // by the multipart/form-data encoding algorithm.
    contentType = 'multipart/form-data; boundary=' + boundary
  } else if (object instanceof Blob) {
    // Blob

    // Set action to this step: read object.
    action = async function * () {
      for await (const chunk of blobGen(object)) {
        yield chunk
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
    if (util.isDisturbed(object) || object.locked) {
      throw new TypeError(
        'Response body object should not be disturbed or locked'
      )
    }

    if (util.isStream(object)) {
      stream = toWebReadable(object)
    } else {
      stream = object
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
    const iterator = action()[Symbol.asyncIterator]()

    let controller
    stream = new ReadableStream({
      async start (c) {
        controller = c
      },
      async pull () {
        const { value, done } = await iterator.next()
        if (done) {
          // When running action is done, close stream.
          queueMicrotask(() => {
            controller.close()
          })
        } else {
          // Whenever one or more bytes are available and stream is not errored,
          // enqueue a Uint8Array wrapping an ArrayBuffer containing the available
          // bytes into stream.
          if (!/state: 'errored'/.test(nodeUtil.inspect(stream))) {
            controller.enqueue(new Uint8Array(value))
          }
        }
        return controller.desiredSize > 0
      },
      async cancel (reason) {
        await iterator.return()
      }
    })
  } else if (!stream) {
    // TODO: Spec doesn't say anything about this?
    stream = new ReadableStream({
      async start (c) {
        c.enqueue(
          typeof source === 'string' ? new TextEncoder().encode(source) : source
        )
        queueMicrotask(() => {
          c.close()
        })
      },
      async pull () {},
      async cancel (reason) {}
    })
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
    const contentType = this.headers.get('Content-Type')

    // If mimeType’s essence is "multipart/form-data", then:
    if (/multipart\/form-data/.test(contentType)) {
      // 1. Parse bytes, using the value of the `boundary` parameter from
      // mimeType, per the rules set forth in Returning Values from Forms:
      // multipart/form-data. [RFC7578]
      const entries = []
      try {
        const m =
          contentType.match(
            /^multipart\/form-data(?:; boundary=(?:(?:"(.+)")|(?:([^\s]+))))$/
          ) ?? []

        // TODO: Try to avoid dicer.
        const d = new Dicer({ boundary: m[1] || m[2] }).on('part', (p) => {
          const chunks = []
          let headers
          p.on('header', (header) => {
            headers = header
          })
            .on('data', (data) => {
              chunks.push(data)
            })
            .on('end', () => {
              const parts = headers['content-disposition']
                ?.map((header) =>
                  header.split(';').map((x) => x.trim().split('='))
                )
                .flat()

              const name = parts
                ?.find((part) => part[0] === 'name')?.[1]
                ?.match(/^"(.*)"$|(.*)/)[1]

              const filename = parts
                ?.find((part) => part[0] === 'filename')?.[1]
                ?.match(/^"(.*)"$|(.*)/)[1]

              if (!name) {
                // TODO: What if part has no name? Error?
                return
              }

              if (filename) {
                // Each part whose `Content-Disposition` header contains a `filename`
                // parameter must be parsed into an entry whose value is a File object
                // whose contents are the contents of the part. The name attribute of
                // the File object must have the value of the `filename` parameter of
                // the part. The type attribute of the File object must have the value
                // of the `Content-Type` header of the part if the part has such header,
                // and `text/plain` (the default defined by [RFC7578] section 4.4)
                // otherwise.
                entries.push([
                  name,
                  new File(chunks, filename, {
                    type: headers['content-type'] ?? 'text/plain'
                  })
                ])
              } else {
                // Each part whose `Content-Disposition` header does not contain a
                // `filename` parameter must be parsed into an entry whose value is the
                // UTF-8 decoded without BOM content of the part. This is done regardless
                // of the presence or the value of a `Content-Type` header and regardless
                // of the presence or the value of a `charset` parameter.
                entries.push([name, Buffer.concat(chunks).toString()])
              }
            })
        })

        await pipelinep(this.body, d)
      } catch (err) {
        // 2. If that fails for some reason, then throw a TypeError.
        throw Object.assign(new TypeError(), { cause: err })
      }

      // 3. Return a new FormData object, appending each entry, resulting from
      // the parsing operation, to entries.
      const formData = new FormData()
      for (const [name, value] of entries) {
        formData.append(name, value)
      }
      return formData
    } else if (/application\/x-www-form-urlencoded/.test(contentType)) {
      // Otherwise, if mimeType’s essence is "application/x-www-form-urlencoded", then:

      // 1. Let entries be the result of parsing bytes.
      let entries
      try {
        entries = new URLSearchParams(await this.text())
      } catch (err) {
        // 2. If entries is failure, then throw a TypeError.
        throw Object.assign(new TypeError(), { cause: err })
      }

      // 3. Return a new FormData object whose entries are entries.
      const formData = new FormData()
      for (const [name, value] of entries) {
        formData.append(name, value)
      }
      return formData
    } else {
      // Otherwise, throw a TypeError.
      throw new TypeError()
    }
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
