'use strict'

const { createInflate, createGunzip, createBrotliDecompress, createZstdDecompress } = require('node:zlib')
const { pipeline } = require('node:stream')
const DecoratorHandler = require('../handler/decorator-handler')

class DecompressHandler extends DecoratorHandler {
  #decompressors = []
  #skipStatusCodes
  #skipErrorResponses

  constructor (handler, { skipStatusCodes = [204, 304], skipErrorResponses = true } = {}) {
    super(handler)
    this.#skipStatusCodes = skipStatusCodes
    this.#skipErrorResponses = skipErrorResponses
  }

  #shouldSkipDecompression (contentEncoding, statusCode) {
    if (!contentEncoding || statusCode < 200) return true
    if (this.#skipStatusCodes.includes(statusCode)) return true
    if (this.#skipErrorResponses && statusCode >= 400) return true
    return false
  }

  #createDecompressor (encoding) {
    const supportedEncodings = {
      gzip: createGunzip,
      'x-gzip': createGunzip,
      deflate: createInflate,
      br: createBrotliDecompress,
      zstd: createZstdDecompress,
      compress: createInflate,
      'x-compress': createInflate
    }

    const createDecompressor = supportedEncodings[encoding.toLowerCase()]
    return createDecompressor ? createDecompressor() : null
  }

  #createDecompressionChain (encodings) {
    const encodingList = encodings.split(',').map(e => e.trim()).filter(Boolean)

    const decompressors = []
    for (let i = encodingList.length - 1; i >= 0; i--) {
      const decompressor = this.#createDecompressor(encodingList[i])
      if (!decompressor) {
        return null
      }
      decompressors.push(decompressor)
    }

    return decompressors
  }

  onResponseStart (controller, statusCode, headers, statusMessage) {
    const contentEncoding = headers['content-encoding']

    if (this.#shouldSkipDecompression(contentEncoding, statusCode)) {
      return super.onResponseStart(controller, statusCode, headers, statusMessage)
    }

    const decompressors = this.#createDecompressionChain(contentEncoding)

    if (!decompressors) {
      this.#decompressors = []
      return super.onResponseStart(controller, statusCode, headers, statusMessage)
    }

    this.#decompressors = decompressors

    const { 'content-encoding': _, 'content-length': __, ...newHeaders } = headers

    if (this.#decompressors.length === 1) {
      const decompressor = this.#decompressors[0]

      decompressor.on('data', (chunk) => {
        super.onResponseData(controller, chunk)
      })

      decompressor.on('drain', () => {
        controller.resume()
      })

      decompressor.on('error', (error) => {
        super.onResponseError(controller, error)
      })

      decompressor.on('finish', () => {
        super.onResponseEnd(controller, {})
      })
    } else {
      const lastDecompressor = this.#decompressors[this.#decompressors.length - 1]

      pipeline(this.#decompressors, (err) => {
        if (err) {
          super.onResponseError(controller, err)
        }
      })

      lastDecompressor.on('data', (chunk) => {
        super.onResponseData(controller, chunk)
      })

      lastDecompressor.on('drain', () => {
        controller.resume()
      })

      lastDecompressor.on('finish', () => {
        super.onResponseEnd(controller, {})
      })
    }

    return super.onResponseStart(controller, statusCode, newHeaders, statusMessage)
  }

  onResponseData (controller, chunk) {
    if (this.#decompressors.length > 0) {
      const writeResult = this.#decompressors[0].write(chunk)
      if (writeResult === false) {
        console.log('pause')
        controller.pause()
      }
      return
    }
    return super.onResponseData(controller, chunk)
  }

  onResponseEnd (controller, trailers) {
    if (this.#decompressors.length > 0) {
      this.#decompressors[0].end()
      this.#decompressors = []
      return
    }
    return super.onResponseEnd(controller, trailers)
  }

  onResponseError (controller, err) {
    if (this.#decompressors.length > 0) {
      this.#decompressors.forEach(decompressor => {
        decompressor.destroy(err)
      })
      this.#decompressors = []
    }
    return super.onResponseError(controller, err)
  }
}

function createDecompressInterceptor (options = {}) {
  return (dispatch) => {
    return (opts, handler) => {
      const decompressHandler = new DecompressHandler(handler, options)
      return dispatch(opts, decompressHandler)
    }
  }
}

module.exports = createDecompressInterceptor
