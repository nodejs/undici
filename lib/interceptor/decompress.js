'use strict'

const { createInflate, createGunzip, createBrotliDecompress, createZstdDecompress } = require('node:zlib')
const { pipeline } = require('node:stream')
const DecoratorHandler = require('../handler/decorator-handler')

class DecompressHandler extends DecoratorHandler {
  #decompressors = []
  #pipelineStream = null
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
      br: createBrotliDecompress,
      zstd: createZstdDecompress,
      deflate: createInflate,
      compress: createInflate,
      'x-compress': createInflate
    }

    const createDecompressor = supportedEncodings[encoding.toLowerCase()]
    return createDecompressor ? createDecompressor() : null
  }

  #createDecompressionChain (encodings) {
    const encodingList = encodings.split(',').map(e => e.trim()).filter(Boolean)

    const decompressors = encodingList
      .reverse()
      .map(encoding => this.#createDecompressor(encoding))

    return decompressors.some(d => !d) ? null : decompressors
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

    const superPause = controller.pause.bind(controller)
    const superResume = controller.resume.bind(controller)

    controller.pause = () => {
      const result = superPause()
      if (this.#decompressors.length > 0) {
        const head = this.#decompressors[0]
        if (!head.readableEnded && !head.destroyed) {
          head.pause()
        }
        if (this.#pipelineStream && !this.#pipelineStream.destroyed) {
          this.#pipelineStream.pause()
        }
      }
      return result
    }

    controller.resume = () => {
      const result = superResume()
      if (this.#decompressors.length > 0) {
        const head = this.#decompressors[0]
        if (!head.readableEnded && !head.destroyed) {
          head.resume()
        }
        if (this.#pipelineStream && !this.#pipelineStream.destroyed) {
          this.#pipelineStream.resume()
        }
      }
      return result
    }

    if (this.#decompressors.length === 1) {
      const decompressor = this.#decompressors[0]
      decompressor.on('data', (chunk) => {
        const result = super.onResponseData(controller, chunk)
        if (result === false) {
          decompressor.pause()
        }
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

      lastDecompressor.on('data', (chunk) => {
        const result = super.onResponseData(controller, chunk)
        if (result === false) {
          lastDecompressor.pause()
        }
      })

      lastDecompressor.on('drain', () => {
        controller.resume()
      })

      this.#pipelineStream = pipeline(this.#decompressors, (err) => {
        if (err) {
          super.onResponseError(controller, err)
          return
        }
        super.onResponseEnd(controller, {})
      })
    }

    return super.onResponseStart(controller, statusCode, newHeaders, statusMessage)
  }

  onResponseData (controller, chunk) {
    if (this.#decompressors.length > 0) {
      const writeResult = this.#decompressors[0].write(chunk)
      if (writeResult === false) {
        controller.pause()
      }
      return true
    }
    return super.onResponseData(controller, chunk)
  }

  onResponseEnd (controller, trailers) {
    if (this.#decompressors.length > 0) {
      this.#decompressors[0].end()
      this.#decompressors = []
      this.#pipelineStream = null
      return
    }
    return super.onResponseEnd(controller, trailers)
  }

  onResponseError (controller, err) {
    if (this.#decompressors.length > 0) {
      this.#decompressors.forEach(d => {
        d.destroy(err)
      })
      this.#decompressors = []
      this.#pipelineStream = null
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
