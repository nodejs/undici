'use strict'

const util = require('../core/util')
const DecoratorHandler = require('../handler/decorator-handler')
const zlib = require('node:zlib')
const { pipeline } = require('node:stream')
const { createInflate } = require('../web/fetch/util')

const nullBodyStatus = [101, 204, 205, 304]

class DecompressHandler extends DecoratorHandler {
  #handler
  #opts

  #inputStream = null
  #trailers = null

  constructor (opts, handler) {
    super(handler)
    this.#handler = handler
    this.#opts = opts
  }
onConnect(abort) {
  this.#inputStream = null
  this.#trailers = null
  return this.#handler.onConnect(abort)
}
  onHeaders (statusCode, rawHeaders, resume, statusMessage) {
    const parsedHeaders = util.parseHeaders(rawHeaders)
    const contentEncoding = parsedHeaders['content-encoding']
    const encodings = contentEncoding ? contentEncoding.split(',').map(e => e.trim().toLowerCase()) : []

    const { method } = this.#opts

    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Encoding
    if (encodings.length !== 0 && method !== 'HEAD' && method !== 'CONNECT' && !nullBodyStatus.includes(statusCode)) {
      const decoders = []
      for (let i = 0; i < encodings.length; ++i) {
        const encoding = encodings[i]
        // https://www.rfc-editor.org/rfc/rfc9112.html#section-7.2
        if (encoding === 'x-gzip' || encoding === 'gzip') {
          decoders.push(zlib.createGunzip({
            // Be less strict when decoding compressed responses, since sometimes
            // servers send slightly invalid responses that are still accepted
            // by common browsers.
            // Always using Z_SYNC_FLUSH is what cURL does.
            flush: zlib.constants.Z_SYNC_FLUSH,
            finishFlush: zlib.constants.Z_SYNC_FLUSH
          }))
        } else if (encoding === 'deflate') {
          decoders.push(createInflate())
        } else if (encoding === 'br') {
          decoders.push(zlib.createBrotliDecompress())
        } else {
          decoders.length = 0
          break
        }
      }

      if (decoders.length !== 0) {
        const [first, ...rest] = decoders
        this.#inputStream = first

        if (rest.length !== 0) {
          pipeline(
            this.#inputStream,
            ...rest,
            err => {
              if (err) {
                this.#handler.onError(err)
              } else {
                this.#handler.onComplete(this.#trailers)
              }
            }
          ).on('data', (chunk) => this.#handler.onData(chunk))
        } else {
          this.#inputStream.on('data', (chunk) => this.#handler.onData(chunk))
          this.#inputStream.on('end', () => this.#handler.onComplete(this.#trailers))
          this.#inputStream.on('error', (err) => this.#handler.onError(err))
        }
      }
    }

    return this.#handler.onHeaders(
      statusCode,
      rawHeaders,
      resume,
      statusMessage
    )
  }

  onData (chunk) {
    if (this.#inputStream) {
      return this.#inputStream.write(chunk)
    }
    return this.#handler.onData(chunk)
  }

  onComplete (trailers) {
    if (this.#inputStream) {
      this.#trailers = trailers
      this.#inputStream.end()
      return
    }

    return this.#handler.onComplete(trailers)
  }
}

function createDecompressionInterceptor () {
  return dispatch => {
    return function Decompress (opts, handler) {
      return dispatch(opts, new DecompressHandler(opts, handler))
    }
  }
}

module.exports = createDecompressionInterceptor
