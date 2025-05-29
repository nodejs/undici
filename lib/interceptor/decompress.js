'use strict'

const { createInflate, createGunzip, createBrotliDecompress } = require('node:zlib')
const { pipeline } = require('node:stream')

function createDecompressInterceptor() {
  return (dispatch) => {
    return (opts, handler) => {
      return dispatch(opts, {
        onConnect(abort) {
          return handler.onConnect?.(abort)
        },

        onError(error) {
          return handler.onError?.(error)
        },

        onUpgrade(statusCode, headers, socket) {
          return handler.onUpgrade?.(statusCode, headers, socket)
        },

        onHeaders(statusCode, headers, resume, statusText) {
          const contentEncoding = headers['content-encoding']
          
          if (!contentEncoding || statusCode < 200 || statusCode === 204 || statusCode === 304) {
            return handler.onHeaders?.(statusCode, headers, resume, statusText)
          }

          // Remove content-encoding header since we're decompressing
          const newHeaders = { ...headers }
          delete newHeaders['content-encoding']
          delete newHeaders['content-length'] // Length will change after decompression

          let decompressor
          switch (contentEncoding.toLowerCase()) {
            case 'gzip':
              decompressor = createGunzip()
              break
            case 'deflate':
              decompressor = createInflate()
              break
            case 'br':
              decompressor = createBrotliDecompress()
              break
            default:
              // Unsupported encoding, pass through
              return handler.onHeaders?.(statusCode, headers, resume, statusText)
          }

          const wrappedHandler = {
            onData(chunk) {
              // Data will be handled by the pipeline
              return true
            },
            onComplete(trailers) {
              return handler.onComplete?.(trailers)
            },
            onError(error) {
              return handler.onError?.(error)
            }
          }

          // Set up decompression pipeline
          if (handler.onData) {
            decompressor.on('data', (chunk) => {
              handler.onData(chunk)
            })
          }

          decompressor.on('error', (error) => {
            handler.onError?.(error)
          })

          decompressor.on('end', () => {
            wrappedHandler.onComplete?.()
          })

          // Store decompressor for onData to use
          wrappedHandler.decompressor = decompressor

          return handler.onHeaders?.(statusCode, newHeaders, resume, statusText)
        },

        onData(chunk) {
          // If we have a decompressor, pipe data through it
          if (this.decompressor) {
            this.decompressor.write(chunk)
            return true
          }
          return handler.onData?.(chunk)
        },

        onComplete(trailers) {
          if (this.decompressor) {
            this.decompressor.end()
            return
          }
          return handler.onComplete?.(trailers)
        }
      })
    }
  }
}

module.exports = createDecompressInterceptor 