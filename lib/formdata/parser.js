'use strict'

const { Writable } = require('stream')
const { states, chars, headerStates, emptyBuffer } = require('./constants')
const { FileStream } = require('./filestream')
const {
  parseMIMEType,
  collectASequenceOfCodePoints,
  collectAnHTTPQuotedString
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
    rawHeaders: null,
    stream: null,
    headers: null,
    fileName: ''
  }

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

        const bytes = this.consume(this.#boundary.length)
        const nextBytes = this.consume(2) // \r\n OR --

        if (!this.#boundary.equals(bytes)) {
          this.destroy(new Error('Received invalid boundary'))
          return
        } else if (nextBytes[0] !== chars.cr || nextBytes[1] !== chars.lf) {
          if (nextBytes[0] === chars['-'] && nextBytes[1] === chars['-']) {
            // Done parsing form-data
            // TODO: emit event or something
            this.end()
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

        if (this.#byteOffset === 0) {
          return callback()
        }

        let buffersToRemove = 0
        // number of bytes to remove from the last buffer
        let bytesToRemove = 0

        done: { // eslint-disable-line no-labels
          for (const buffer of this.#buffers) {
            for (const byte of buffer) {
              const state = this.#info.headerState

              if (byte !== chars.cr && byte !== chars.lf) {
                // Some pieces may have multiple headers, separated by \r\n.
                // We need to also consider those bytes.
                if (state === headerStates.FIRST) { // \r
                  bytesToRemove += 1
                } else if (state === headerStates.SECOND) { // \r\n
                  bytesToRemove += 2
                }

                bytesToRemove += 1
                this.#info.headerState = headerStates.DEFAULT
              } else if (byte === chars.cr && state === headerStates.DEFAULT) {
                this.#info.headerState = headerStates.FIRST
              } else if (byte === chars.lf && state === headerStates.FIRST) {
                this.#info.headerState = headerStates.SECOND
              } else if (byte === chars.cr && state === headerStates.SECOND) {
                this.#info.headerState = headerStates.THIRD
              } else if (byte === chars.lf && state === headerStates.THIRD) {
                // Got \r\n\r\n which marks the end of the headers.
                this.#state = states.READ_BODY

                break done // eslint-disable-line no-labels
              }
            }

            bytesToRemove = 0
            buffersToRemove += 1
          }

          return callback()
        }

        const headers = this.#info.rawHeaders ?? []
        let headersLength = 0

        while (buffersToRemove-- > 0) {
          const buffer = this.#buffers.shift()
          headers.push(buffer)
          headersLength += buffer.length
        }

        if (bytesToRemove > 0) {
          const header = this.#buffers[0].subarray(0, bytesToRemove)
          headers.push(header)
          headersLength += header.length

          this.#buffers[0] = this.#buffers[0].subarray(bytesToRemove)
        }

        this.#byteOffset -= headersLength
        this.consume(4) // remove \r\n\r\n
        this.#parseRawHeaders(Buffer.concat(headers, headersLength))

        this.#info.stream = new FileStream()
        this.emit(
          'file',
          this.#info.fileName,
          this.#info.stream,
          {} // TODO
        )
      } else if (this.#state === states.READ_BODY) {
        // A part's body can contain CRLFs so they cannot be used to
        // determine when the body ends. We need to check if a chunk
        // (or chunks) contains the boundary to stop parsing the body.

        if (this.#byteOffset < this.#boundary.length) {
          return callback()
        }

        /** @type {Buffer} */
        let buffer = this.#buffers.shift()
        let bufferLength = buffer.length

        while (!buffer.includes(this.#boundary)) {
          // No more buffers to check
          if (this.#byteOffset === 0) {
            this.#buffers.unshift(buffer)
            buffer = undefined
            return callback()
          }

          const doubleDashIdx = buffer.length ? buffer.indexOf('--') : null

          if (doubleDashIdx === -1) {
            // Chunk is completely useless, emit it
            this.#info.stream.push(buffer)
            buffer = emptyBuffer
            bufferLength = 0
          } else if (doubleDashIdx + this.#boundary.length < buffer.length) {
            // If the double dash index is not part of the boundary and
            // not a chunked piece of the boundary
            this.#info.stream.push(buffer)
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

          this.#info.stream.push(buffer.subarray(0, idx - 4)) // remove \r\n--
          this.#info.stream.destroy()

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
    this.#info.rawHeaders = null

    // https://www.rfc-editor.org/rfc/rfc7578#section-4.8

    const headers = {}
    const position = { position: 0 }

    while (position.position < buffer.length) {
      const nameBuffer = collectASequenceOfCodePoints(
        (char) => char !== chars[':'],
        buffer,
        position
      )

      // Invalid header; has no value
      if (position.position >= buffer.length) {
        break
      }

      // MIME header fields in multipart bodies are required to
      // consist only of 7-bit data in the US-ASCII character set
      const name = nameBuffer.toString('ascii').toLowerCase()

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
          if (name === 'content-disposition') {
            // mimetypes (ie. from a content-type header) can have
            // a semicolon in it. In that case, we want to read the
            // entire value in, not just until we reach a semicolon
            return char !== chars[';']
          }

          return char !== chars.cr && buffer[position.position + 1] !== chars.lf
        },
        buffer,
        position
      )

      headers[name] = value.toString('ascii')

      // No attributes
      if (position.position >= buffer.length) {
        continue
      }

      const attributes = collectASequenceOfCodePoints(
        (char) => char !== chars.cr && buffer[position.position + 1] !== chars.lf,
        buffer,
        position
      )

      if (name === 'content-disposition') {
        const attrs = attributes.toString('ascii').slice(1)

        const equalIdx = attrs.indexOf('=')
        const attrName = attrs.slice(0, equalIdx).trim()
        const attrValue = attrs.slice(equalIdx + 1)

        const position = { position: 0 }
        const value = attrValue[0] === '"'
          ? collectAnHTTPQuotedString(attrValue, position, true)
          : attrValue

        // TODO: match busboy's behavior with error handling
        if (attrName !== 'name') {
          this.destroy('Invalid attribute')
          return
        }

        this.#info.fileName = value
      }

      position.position += 2 // skip \r\n
    }

    // Validate the header values here
    // TODO: match busboy's behavior with error handling
    if (headers['content-disposition'] !== 'form-data') {
      this.destroy(new Error('received invalid content-disposition header'))
      return
    }

    this.#info.headers = headers
  }
}

module.exports = {
  FormDataParser
}
