'use strict'

const { createInflate, createGunzip, createBrotliDecompress } = require('node:zlib')
const DecoratorHandler = require('../handler/decorator-handler')

class DecompressHandler extends DecoratorHandler {
  #decompressor = null

  onResponseStart (controller, statusCode, headers, statusMessage) {
    const contentEncoding = headers['content-encoding']

    if (!contentEncoding || statusCode < 200 || [204, 304].includes(statusCode)) {
      return super.onResponseStart(controller, statusCode, headers, statusMessage)
    }

    // Remove content-encoding header since we're decompressing
    const { 'content-encoding': _, 'content-length': __, ...newHeaders } = headers

    const supportedEncodings = {
      gzip: createGunzip,
      deflate: createInflate,
      br: createBrotliDecompress
    }

    const createDecompressor = supportedEncodings[contentEncoding.toLowerCase()]
    if (!createDecompressor) {
      return super.onResponseStart(controller, statusCode, headers, statusMessage)
    }

    this.#decompressor = createDecompressor()

    // Set up decompressor event handlers
    this.#decompressor.on('data', (chunk) => {
      super.onResponseData(controller, chunk)
    })

    this.#decompressor.on('error', (error) => {
      super.onResponseError(controller, error)
    })

    this.#decompressor.on('finish', () => {
      super.onResponseEnd(controller, {})
    })

    return super.onResponseStart(controller, statusCode, newHeaders, statusMessage)
  }

  onResponseData (controller, chunk) {
    // If we have a decompressor, pipe data through it
    if (this.#decompressor) {
      this.#decompressor.write(chunk)
      return true
    }
    return super.onResponseData(controller, chunk)
  }

  onResponseEnd (controller, trailers) {
    if (this.#decompressor) {
      this.#decompressor.end()
      this.#decompressor = null
      return
    }
    return super.onResponseEnd(controller, trailers)
  }

  onResponseError (controller, err) {
    if (this.#decompressor) {
      this.#decompressor.destroy(err)
      this.#decompressor = null
    }
    return super.onResponseError(controller, err)
  }
}

function createDecompressInterceptor () {
  return (dispatch) => {
    return (opts, handler) => {
      const decompressHandler = new DecompressHandler(handler)
      return dispatch(opts, decompressHandler)
    }
  }
}

module.exports = createDecompressInterceptor
