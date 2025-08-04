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

  // Determines if decompression should be skipped based on encoding and status code
  #shouldSkipDecompression (contentEncoding, statusCode) {
    if (!contentEncoding || statusCode < 200) return true
    if (this.#skipStatusCodes.includes(statusCode)) return true
    if (this.#skipErrorResponses && statusCode >= 400) return true
    return false
  }

  // Creates a decompressor stream for the given encoding
  #createDecompressor (encoding) {
    const supportedEncodings = {
      gzip: createGunzip,
      'x-gzip': createGunzip,
      br: createBrotliDecompress,
      deflate: createInflate,
      compress: createInflate,
      'x-compress': createInflate
    }
    if (createZstdDecompress) supportedEncodings.zstd = createZstdDecompress

    const create = supportedEncodings[encoding.toLowerCase()]
    return create ? create() : null
  }

  // Creates a chain of decompressors for multiple content encodings
  #createDecompressionChain (encodings) {
    const parts = encodings.split(',')
    const decompressors = []

    for (let i = parts.length - 1; i >= 0; i--) {
      const encoding = parts[i].trim()
      if (!encoding) continue

      const decompressor = this.#createDecompressor(encoding)
      if (!decompressor) return null

      decompressors.push(decompressor)
    }

    return decompressors
  }

  // Pauses all decompressor streams to handle backpressure
  #pauseDecompressors () {
    if (this.#decompressors.length > 0) {
      const head = this.#decompressors[0]
      if (!head.readableEnded && !head.destroyed) {
        head.pause()
      }
      if (this.#pipelineStream && !this.#pipelineStream.destroyed) {
        this.#pipelineStream.pause()
      }
    }
  }

  // Resumes all decompressor streams after backpressure is resolved
  #resumeDecompressors () {
    if (this.#decompressors.length > 0) {
      const head = this.#decompressors[0]
      if (!head.readableEnded && !head.destroyed) {
        head.resume()
      }
      if (this.#pipelineStream && !this.#pipelineStream.destroyed) {
        this.#pipelineStream.resume()
      }
    }
  }

  // Overrides controller pause/resume methods to coordinate with decompressor streams
  #overrideControllerMethods (controller) {
    const superPause = controller.pause.bind(controller)
    const superResume = controller.resume.bind(controller)

    // Override to pause/resume decompression streams with controller
    controller.pause = () => {
      const result = superPause()
      this.#pauseDecompressors()
      return result
    }

    controller.resume = () => {
      const result = superResume()
      this.#resumeDecompressors()
      return result
    }
  }

  // Sets up event handlers for a decompressor stream
  #setupDecompressorEvents (decompressor, controller) {
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
  }

  // Sets up event handling for a single decompressor
  #setupSingleDecompressor (controller) {
    const decompressor = this.#decompressors[0]
    this.#setupDecompressorEvents(decompressor, controller)

    decompressor.on('finish', () => {
      super.onResponseEnd(controller, {})
    })
  }

  // Sets up event handling for multiple chained decompressors using pipeline
  #setupMultipleDecompressors (controller) {
    const lastDecompressor = this.#decompressors[this.#decompressors.length - 1]
    this.#setupDecompressorEvents(lastDecompressor, controller)

    this.#pipelineStream = pipeline(this.#decompressors, (err) => {
      if (err) {
        super.onResponseError(controller, err)
        return
      }
      super.onResponseEnd(controller, {})
    })
  }

  // Cleans up decompressor references to prevent memory leaks
  #cleanupDecompressors () {
    this.#decompressors = []
    this.#pipelineStream = null
  }

  onResponseStart (controller, statusCode, headers, statusMessage) {
    const contentEncoding = headers['content-encoding']

    // If content encoding is not supported or status code is in skip list
    if (this.#shouldSkipDecompression(contentEncoding, statusCode)) {
      return super.onResponseStart(controller, statusCode, headers, statusMessage)
    }

    const decompressors = this.#createDecompressionChain(contentEncoding)

    if (!decompressors) {
      this.#cleanupDecompressors()
      return super.onResponseStart(controller, statusCode, headers, statusMessage)
    }

    this.#decompressors = decompressors
    this.#overrideControllerMethods(controller)

    // Remove compression headers since we're decompressing
    const { 'content-encoding': _, 'content-length': __, ...newHeaders } = headers

    if (this.#decompressors.length === 1) {
      this.#setupSingleDecompressor(controller)
    } else {
      this.#setupMultipleDecompressors(controller)
    }

    return super.onResponseStart(controller, statusCode, newHeaders, statusMessage)
  }

  onResponseData (controller, chunk) {
    if (this.#decompressors.length > 0) {
      const writeResult = this.#decompressors[0].write(chunk)
      if (writeResult === false) {
        controller.pause() // Handle backpressure
      }
      return true
    }
    return super.onResponseData(controller, chunk)
  }

  onResponseEnd (controller, trailers) {
    if (this.#decompressors.length > 0) {
      this.#decompressors[0].end()
      this.#cleanupDecompressors()
      return
    }
    return super.onResponseEnd(controller, trailers)
  }

  onResponseError (controller, err) {
    if (this.#decompressors.length > 0) {
      this.#decompressors.forEach(d => {
        d.destroy(err)
      })
      this.#cleanupDecompressors()
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
