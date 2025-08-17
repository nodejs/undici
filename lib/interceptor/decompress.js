'use strict'

const { createInflate, createGunzip, createBrotliDecompress, createZstdDecompress } = require('node:zlib')
const { pipeline } = require('node:stream')
const DecoratorHandler = require('../handler/decorator-handler')

/** @typedef {import('node:stream').Transform} Transform */
/** @typedef {import('node:stream').Transform} Controller */
/** @typedef {Transform&import('node:zlib').Zlib} DecompressorStream */

/** @type {Map<string, () => DecompressorStream>} */
const supportedEncodings = new Map(Object.entries({
  gzip: createGunzip,
  'x-gzip': createGunzip,
  br: createBrotliDecompress,
  deflate: createInflate,
  compress: createInflate,
  'x-compress': createInflate,
  ...(createZstdDecompress ? { zstd: createZstdDecompress } : {})
}))

const defaultSkipStatusCodes = /** @type {const} */ ([204, 304])

/**
 * @typedef {Object} DecompressHandlerOptions
 * @property {number[]|Readonly<number[]>} [skipStatusCodes=[204, 304]] - List of status codes to skip decompression for
 * @property {boolean} [skipErrorResponses] - Whether to skip decompression for error responses (status codes >= 400)
 */

class DecompressHandler extends DecoratorHandler {
  /** @type {Transform[]} */
  #decompressors = []
  /** @type {NodeJS.WritableStream&NodeJS.ReadableStream|null} */
  #pipelineStream
  /** @type {Readonly<number[]>} */
  #skipStatusCodes
  /** @type {boolean} */
  #skipErrorResponses

  constructor (handler, { skipStatusCodes = defaultSkipStatusCodes, skipErrorResponses = true } = {}) {
    super(handler)
    this.#skipStatusCodes = skipStatusCodes
    this.#skipErrorResponses = skipErrorResponses
  }

  /**
   * Determines if decompression should be skipped based on encoding and status code
   * @param {string} contentEncoding - Content-Encoding header value
   * @param {number} statusCode - HTTP status code of the response
   * @returns {boolean} - True if decompression should be skipped
   */
  #shouldSkipDecompression (contentEncoding, statusCode) {
    if (!contentEncoding || statusCode < 200) return true
    if (this.#skipStatusCodes.includes(statusCode)) return true
    if (this.#skipErrorResponses && statusCode >= 400) return true
    return false
  }

  /**
   * Creates a chain of decompressors for multiple content encodings
   *
   * @param {string} encodings - Comma-separated list of content encodings
   * @returns {Array<DecompressorStream>} - Array of decompressor streams
   */
  #createDecompressionChain (encodings) {
    const parts = encodings.split(',')

    /** @type {DecompressorStream[]} */
    const decompressors = []

    for (let i = parts.length - 1; i >= 0; i--) {
      const encoding = parts[i].trim()
      if (!encoding) continue

      if (supportedEncodings.has(encoding) === false) {
        decompressors.length = 0 // Clear if unsupported encoding
        return decompressors // Unsupported encoding
      }

      decompressors.push(supportedEncodings.get(encoding)())
    }

    return decompressors
  }

  /**
   * Pauses all decompressor streams to handle backpressure
   * @returns {void}
   */
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

  /**
   * Resumes all decompressor streams after backpressure is resolved
   * @returns {void}
   */
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

  /**
   * Overrides controller pause/resume methods to coordinate with decompressor streams
   * @param {Controller} controller - The controller to override
   * @returns {void}
   */
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

  /**
   * Sets up event handlers for a decompressor stream
   * @param {Transform} decompressor - The decompressor stream to set up
   * @param {Controller} controller - The controller to handle events
   * @returns {void}
   */
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

  /**
   * Sets up event handling for a single decompressor
   * @param {Controller} controller - The controller to handle events
   * @returns {void}
   */
  #setupSingleDecompressor (controller) {
    const decompressor = this.#decompressors[0]
    this.#setupDecompressorEvents(decompressor, controller)

    decompressor.on('finish', () => {
      super.onResponseEnd(controller, {})
    })
  }

  /**
   * Sets up event handling for multiple chained decompressors using pipeline
   * @param {Controller} controller - The controller to handle events
   * @returns {void}
   */
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

  /**
   * Cleans up decompressor references to prevent memory leaks
   * @returns {void}
   */
  #cleanupDecompressors () {
    this.#decompressors.length = 0
    this.#pipelineStream = null
  }

  /**
   * @param {Controller} controller
   * @param {number} statusCode
   * @param {Record<string, string>} headers
   * @param {string} statusMessage
   */
  onResponseStart (controller, statusCode, headers, statusMessage) {
    const contentEncoding = headers['content-encoding']

    // If content encoding is not supported or status code is in skip list
    if (this.#shouldSkipDecompression(contentEncoding, statusCode)) {
      return super.onResponseStart(controller, statusCode, headers, statusMessage)
    }

    const decompressors = this.#createDecompressionChain(contentEncoding.toLowerCase())

    if (decompressors.length === 0) {
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

  /**
   * @param {Controller} controller
   * @param {Buffer} chunk
   */
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

  /**
   * @param {Controller} controller
   * @param {Record<string, string>} trailers
   */
  onResponseEnd (controller, trailers) {
    if (this.#decompressors.length > 0) {
      this.#decompressors[0].end()
      this.#cleanupDecompressors()
      return
    }
    return super.onResponseEnd(controller, trailers)
  }

  /**
   * @param {Controller} controller
   * @param {Error} err
   */
  onResponseError (controller, err) {
    if (this.#decompressors.length > 0) {
      for (const decompressor of this.#decompressors) {
        decompressor.destroy(err)
      }
      this.#cleanupDecompressors()
    }
    return super.onResponseError(controller, err)
  }
}

/**
 * Creates a decompression interceptor for HTTP responses
 * @param {DecompressHandlerOptions} [options] - Options for the interceptor
 * @returns {Function} - Interceptor function
 */
function createDecompressInterceptor (options = {}) {
  return (dispatch) => {
    return (opts, handler) => {
      const decompressHandler = new DecompressHandler(handler, options)
      return dispatch(opts, decompressHandler)
    }
  }
}

module.exports = createDecompressInterceptor
