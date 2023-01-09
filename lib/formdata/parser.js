'use strict'

const { Writable } = require('stream')
const { basename } = require('path')
const { states, chars, headerStates, emptyBuffer } = require('./constants')
const { FileStream } = require('./filestream')
const {
  collectHTTPQuotedStringLenient,
  findCharacterType
} = require('./util')
const {
  parseMIMEType,
  collectASequenceOfCodePoints,
  stringPercentDecode
} = require('../fetch/dataURL')

class FormDataParser extends Writable {
  /** @type {Buffer[]} */
  #buffers = []
  #byteOffset = 0

  #state = states.INITIAL

  /** @type {Buffer} */
  #boundary

  #info = {
    headerState: headerStates.DEFAULT,
    stream: null,
    body: {
      chunks: [],
      length: 0
    },
    complete: false,
    limits: {
      fieldNameSize: 0,
      fieldSize: 0,
      fields: 0,
      fileSize: 0,
      files: 0,
      parts: 0,
      headerPairs: 0
    },
    headers: {
      attributes: {}
    }
  }

  #opts = {}

  constructor (opts) {
    super(opts)

    const contentType = opts.headers.get?.('content-type') ?? opts.headers['content-type']
    const mimeType = contentType ? parseMIMEType(contentType) : null

    if (mimeType === null || mimeType.essence !== 'multipart/form-data') {
      this.destroy(new Error('Invalid mimetype essence.'))
      return
    } else if (!mimeType.parameters.has('boundary')) {
      this.destroy(new Error('No boundary parameter.'))
    }

    this.#boundary = Buffer.from(mimeType.parameters.get('boundary'))

    this.#opts.defCharset = opts?.defCharset ?? 'utf8'
    this.#opts.defParamCharset = opts?.defParamCharset ?? 'utf8'
    this.#opts.preservePath = !!opts?.preservePath
    this.#opts.limits = {
      fieldNameSize: opts?.limits?.fieldNameSize ?? 100,
      fieldSize: opts?.limits?.fieldSize ?? 1000 * 1000,
      fields: opts?.limits?.fields ?? Infinity,
      fileSize: opts?.limits?.fileSize ?? Infinity,
      files: opts?.limits?.files ?? Infinity,
      parts: opts?.limits?.parts ?? Infinity,
      headerPairs: opts?.limits?.headerPairs ?? 2000
    }
  }

  /**
   * @param {Buffer} chunk
   * @param {() => void} callback
   */
  _write (chunk, _, callback) {
    this.#buffers.push(chunk)
    this.#byteOffset += chunk.length

    this.run(callback)
  }

  /**
   * @param {((error?: Error | null) => void)} cb
   */
  _final (cb) {
    if (!this.#info.complete) {
      return cb(new Error('Unexpected end of form'))
    }
  }

  /**
   * @param {Error|null} err
   * @param {((error?: Error|null) => void)} cb
   */
  _destroy (err, cb) {
    if (this.#info.stream) {
      // Push any leftover buffers to the filestream
      for (const leftover of this.#buffers) {
        this.#info.stream.push(leftover)
      }

      // Emit an error event on the file stream if there is one
      this.#info.stream.destroy(err)
      this.#info.stream = null
    }

    cb(err)
  }

  /**
   * @param {() => void} callback
   */
  run (callback) {
    while (true) {
      if (this.#state === states.INITIAL) {
        if (this.#byteOffset < 2) {
          return callback()
        }

        const bytes = this.consume(2)

        if (bytes[0] !== chars['-'] || bytes[1] !== chars['-']) {
          this.destroy(new Error('FormData should start with --'))
          return
        }

        this.#state = states.BOUNDARY
      } else if (this.#state === states.BOUNDARY) {
        if (this.#byteOffset < this.#boundary.length + 2) {
          return callback()
        }

        this.#info.skipPart = ''

        const bytes = this.consume(this.#boundary.length)
        const nextBytes = this.consume(2) // \r\n OR --

        if (!this.#boundary.equals(bytes)) {
          this.destroy(new Error('Received invalid boundary'))
          return
        } else if (nextBytes[0] !== chars.cr || nextBytes[1] !== chars.lf) {
          if (nextBytes[0] === chars['-'] && nextBytes[1] === chars['-']) {
            // Done parsing form-data

            this.#info.complete = true
            this.destroy()
            return
          }

          this.destroy(new Error('Boundary did not end with CRLF'))
          return
        }

        this.#state = states.READ_HEADERS
      } else if (this.#state === states.READ_HEADERS) {
        // There can be an arbitrary amount of headers and each one has an
        // arbitrary length. Therefore it's easier to read the headers, and
        // then parse once we receive 2 CRLFs which marks the body's start.

        if (this.#byteOffset < 4) {
          return callback()
        }

        // number of bytes to remove from the last buffer
        let bytesToRemove = 0

        done: { // eslint-disable-line no-labels
          this.#info.headerState = headerStates.DEFAULT

          for (let j = 0; j < this.#buffers.length; j++) {
            const buffer = this.#buffers[j]

            for (let i = 0; i < buffer.length; i++) {
              const byte = buffer[i]
              const state = this.#info.headerState

              if (byte === chars.cr && state === headerStates.DEFAULT) {
                this.#info.headerState = headerStates.FIRST
              } else if (byte === chars.lf && state === headerStates.FIRST) {
                this.#info.headerState = headerStates.SECOND
              } else if (byte === chars.cr && state === headerStates.SECOND) {
                this.#info.headerState = headerStates.THIRD
              } else if (byte === chars.lf && state === headerStates.THIRD) {
                // Got \r\n\r\n which marks the end of the headers.
                this.#state = states.READ_BODY
                bytesToRemove += i

                const removed = this.consume(bytesToRemove - 3) // remove \r\n\r
                const headers = this.#info.headers

                // This is a very lazy implementation.
                if ('content-type' in headers && headers['content-type'].length === 0) {
                  const mimeUnparsed = removed.toString(this.#opts.defCharset)
                  const mimeType = parseMIMEType(mimeUnparsed)

                  if (mimeType !== 'failure') {
                    headers['content-type'] = mimeType.essence
                  }
                }

                this.#parseRawHeaders(removed)
                this.consume(4)

                break done // eslint-disable-line no-labels
              } else {
                this.#info.headerState = headerStates.DEFAULT

                if (state === headerStates.SECOND) {
                  const removed = this.consume(bytesToRemove + i - 2)

                  if (this.#info.skipPart) {
                    // If we are meant to skip this part, we shouldn't
                    // parse the headers. We just need to consume the bytes.
                    continue
                  }

                  this.#parseRawHeaders(removed)
                  this.consume(2)
                  bytesToRemove -= removed.length + 2
                }
              }
            }

            bytesToRemove += buffer.length
          }

          return callback()
        }

        const { attributes, ...headers } = this.#info.headers

        if (
          !this.#info.skipPart &&
          (
            headers['content-disposition'] !== 'form-data' ||
            !attributes.name
          )
        ) {
          // https://www.rfc-editor.org/rfc/rfc7578#section-4.2
          this.#info.skipPart = 'invalid content-disposition'
        } else if (
          attributes.filename !== undefined ||
          attributes['filename*'] !== undefined ||
          headers['content-type'] === 'application/octet-stream'
        ) {
          if (this.#info.limits.files >= this.#opts.limits.files) {
            this.#info.skipPart = 'file'
            continue
          }

          // End the active stream if there is one
          this.#info.stream?.push(null)
          this.#info.stream = new FileStream()
          this.#info.stream.truncated = false // TODO

          this.emit(
            'file',
            attributes.name, // name is a required attribute
            this.#info.stream,
            {
              filename: attributes.filename ?? attributes['filename*'] ?? '',
              encoding: headers['content-transfer-encoding'] ?? '7bit',
              mimeType: headers['content-type'] || 'application/octet-stream'
            }
          )
        }
      } else if (this.#state === states.READ_BODY) {
        // A part's body can contain CRLFs so they cannot be used to
        // determine when the body ends. We need to check if a chunk
        // (or chunks) contains the boundary to stop parsing the body.

        if (this.#byteOffset < this.#boundary.length) {
          return callback()
        }

        /** @type {Buffer} */
        let buffer = this.consume(this.#byteOffset)
        let bufferLength = buffer.length

        while (!buffer.includes(this.#boundary)) {
          // No more buffers to check
          if (this.#byteOffset === 0) {
            this.#buffers.unshift(buffer)
            this.#byteOffset += buffer.length
            buffer = undefined
            return callback()
          }

          const doubleDashIdx = buffer.length ? buffer.indexOf('--') : null

          if (doubleDashIdx === -1) {
            // Chunk is completely useless, emit it
            if (this.#info.stream !== null) {
              this.#info.stream.push(buffer)
            } else {
              this.#info.body.chunks.push(buffer)
              this.#info.body.length += buffer.length
            }

            buffer = emptyBuffer
            bufferLength = 0
          } else if (doubleDashIdx + this.#boundary.length < buffer.length) {
            // If the double dash index is not part of the boundary and
            // not a chunked piece of the boundary
            if (this.#info.stream !== null) {
              this.#info.stream.push(buffer)
            } else {
              this.#info.body.chunks.push(buffer)
              this.#info.body.length += buffer.length
            }

            buffer = emptyBuffer
            bufferLength = 0
          }

          const next = this.#buffers.shift()
          this.#byteOffset -= next.length
          bufferLength += next.length
          buffer = Buffer.concat([buffer, next], bufferLength)
        }

        if (bufferLength === this.#boundary.length) {
          this.#buffers.unshift(buffer)
          this.#byteOffset += buffer.length

          this.#state = states.BOUNDARY
        } else {
          const idx = buffer.indexOf(this.#boundary)
          const rest = buffer.subarray(idx)
          const chunk = buffer.subarray(0, idx - 4) // remove \r\n--

          // If the current part is a file
          if (
            this.#info.stream !== null &&
            this.#info.limits.fileSize < this.#opts.limits.fileSize &&
            !this.#info.skipPart
          ) {
            const limit = this.#opts.limits.fileSize
            const current = this.#info.limits.fileSize
            const length = chunk.length

            let limitedChunk

            if (current + length >= limit) {
              // If the limit is reached
              limitedChunk = chunk.subarray(0, limit - (current + length))

              this.#info.stream.emit('limit') // TODO: arguments?
              this.#info.stream.truncated = true
            } else {
              limitedChunk = chunk
            }

            this.#info.limits.files += 1
            this.#info.limits.fileSize += length

            this.#info.stream.push(limitedChunk)
            this.#info.stream.destroy()
          } else if (
            this.#info.limits.fieldSize < this.#opts.limits.fieldSize &&
            !this.#info.skipPart &&
            this.listenerCount('field') > 0
          ) {
            const { headers: { attributes, ...headers }, body } = this.#info

            body.chunks.push(chunk)
            body.length += chunk.length

            let fullBody = Buffer.concat(body.chunks, body.length)

            const limit = this.#opts.limits.fieldSize
            const current = this.#info.limits.fieldSize

            let valueTruncated = false

            if (current + body.length >= limit) {
              // If the limit is reached
              fullBody = fullBody.subarray(0, limit - (current + body.length))

              valueTruncated = true
            }

            this.#info.limits.fieldSize += body.length

            this.emit(
              'field',
              attributes.name,
              new TextDecoder('utf-8', { fatal: true }).decode(fullBody),
              {
                nameTruncated: false,
                valueTruncated,
                encoding: headers['content-transfer-encoding'] ?? '7bit',
                mimeType: headers['content-type'] || 'text/plain'
              }
            )

            body.chunks.length = 0
            body.length = 0
          } else if (this.#info.skipPart === 'file') {
            this.emit('filesLimit')
          }

          this.#buffers.unshift(rest)
          this.#byteOffset += rest.length

          this.#state = states.BOUNDARY
        }
      }
    }
  }

  /**
   * Take n bytes from the buffered Buffers
   * @param {number} n
   * @returns {Buffer|null}
   */
  consume (n) {
    if (n > this.#byteOffset) {
      return null
    } else if (n === 0) {
      return emptyBuffer
    }

    if (this.#buffers[0].length === n) {
      this.#byteOffset -= this.#buffers[0].length
      return this.#buffers.shift()
    }

    const buffer = Buffer.allocUnsafe(n)
    let offset = 0

    while (offset !== n) {
      const next = this.#buffers[0]
      const { length } = next

      if (length + offset === n) {
        buffer.set(this.#buffers.shift(), offset)
        break
      } else if (length + offset > n) {
        buffer.set(next.subarray(0, n - offset), offset)
        this.#buffers[0] = next.subarray(n - offset)
        break
      } else {
        buffer.set(this.#buffers.shift(), offset)
        offset += next.length
      }
    }

    this.#byteOffset -= n

    return buffer
  }

  /**
   * @param {Buffer} buffer
   */
  #parseRawHeaders (buffer) {
    // https://www.rfc-editor.org/rfc/rfc7578#section-4.8

    const headers = this.#info.headers
    const attributes = this.#info.headers.attributes

    const position = { position: 0 }

    while (position.position < buffer.length) {
      const nameBuffer = collectASequenceOfCodePoints(
        (char) => char !== chars[':'],
        buffer,
        position
      )

      if (position.position >= buffer.length) {
        // Invalid header; doesn't contain a delimiter
        break
      } else if (nameBuffer.length === 0) {
        // https://www.rfc-editor.org/rfc/rfc9110.html#section-5.1-2
        // field-name     = token
        // tchar = "!" / "#" / "$" / "%" / "&" / "'" / "*" / "+" / "-" / "." /
        // "^" / "_" / "`" / "|" / "~" / DIGIT / ALPHA
        // token = 1*tchar

        // The field name MUST be at least 1 character long.
        this.#info.skipPart = 'malformed part header'
        this.emit('error', new Error('Malformed part header'))
        break
      }

      // MIME header fields in multipart bodies are required to
      // consist only of 7-bit data in the US-ASCII character set
      const name = nameBuffer.toString(this.#opts.defCharset).toLowerCase()

      if (
        name !== 'content-type' &&
        name !== 'content-disposition' &&
        name !== 'content-transfer-encoding'
      ) {
        // The multipart/form-data media type does not support any MIME header
        // fields in parts other than Content-Type, Content-Disposition, and (in
        // limited circumstances) Content-Transfer-Encoding.  Other header
        // fields MUST NOT be included and MUST be ignored.

        // Go to the next header if one is available. Headers are split by \r\n,
        // so we skip all characters until the sequence is found.
        collectASequenceOfCodePoints(
          (char) => char !== chars.cr && buffer[position.position + 1] !== chars.lf,
          buffer,
          position
        )

        continue
      }

      if (buffer[position.position + 1] === chars[' ']) {
        position.position += 2 // skip "; "
      } else {
        position.position++ // skip ":"
      }

      const value = collectASequenceOfCodePoints(
        (char) => {
          return (
            char !== chars[';'] &&
            (char !== chars.cr && buffer[position.position + 1] !== chars.lf)
          )
        },
        buffer,
        position
      )

      headers[name] = value.toString('ascii')

      // No attributes
      if (position.position >= buffer.length) {
        continue
      }

      if (name !== 'content-disposition') {
        collectASequenceOfCodePoints(
          (char) => char !== chars.cr && buffer[position.position + 1] !== chars.lf,
          buffer,
          position
        )
      } else {
        // A content-disposition header can contain multiple attributes,
        // separated with a semicolon in the form of name=value.

        while (position.position < buffer.length) {
          position.position++ // skip ";"

          const collected = collectASequenceOfCodePoints(
            (char) => {
              if (char === chars.cr) {
                return buffer[position.position + 1] !== chars.lf
              }

              return char !== chars[';']
            },
            buffer,
            position
          )

          const attribute = collected.toString(this.#opts.defParamCharset)
          const equalIdx = attribute.indexOf('=')
          const name = attribute.slice(0, equalIdx).trim().toLowerCase()
          const value = collectHTTPQuotedStringLenient(attribute.slice(equalIdx + 1))

          if (name === 'filename*') {
            // https://www.rfc-editor.org/rfc/rfc6266#section-4.3

            // This attribute is split into 3 parts:
            // 1. The character type (ie. utf-8)
            // 2. The optional language tag (ie. en or ''). This value is in single quotes.
            // 3. The percent encoded name.

            const quote1 = value.indexOf('\'')
            const quote2 = value.indexOf('\'', quote1 + 1)

            const characterType = findCharacterType(value.slice(0, quote1))
            const percentEncoded = value.slice(quote2 + 1)

            attributes['filename*'] = new TextDecoder(characterType).decode(
              stringPercentDecode(percentEncoded)
            )

            attributes.filename ??= undefined
          } else if (name === 'filename') {
            // Therefore, when both
            // "filename" and "filename*" are present in a single header field
            // value, recipients SHOULD pick "filename*" and ignore "filename".
            if (!attributes['filename*']) {
              attributes[name] = this.#opts.preservePath ? value : basename(value)
            }
          } else {
            attributes[name] = value
          }

          if (buffer[position.position] === chars.cr) {
            break
          }
        }
      }

      position.position += 2 // skip \r\n
    }

    return { headers, attributes }
  }
}

module.exports = {
  FormDataParser
}
