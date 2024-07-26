const { pipeline } = require('node:stream')
const zlib = require('node:zlib')
const { redirectStatusSet, nullBodyStatus } = require('./constants')
const { createInflate } = require('./util')

/**
 * Decompress the given response body.
 * @param {Request} request
 * @param {Response} response
 * @returns {ReadableStream<Uint8Array> | null}
 */
function decompress (request, response) {
  const contentEncoding = response.headers.get('content-encoding')

  if (!contentEncoding) {
    return response.body
  }

  // https://www.rfc-editor.org/rfc/rfc7231#section-3.1.2.1
  // "All content-coding values are case-insensitive..."
  const codings = contentEncoding
    .toLowerCase()
    .split(',')
    .map((coding) => coding.trim())

  if (codings.length === 0) {
    return response.body
  }

  const willFollow =
    response.headers.get('location') &&
    request.redirect === 'follow' &&
    redirectStatusSet.has(response.status)

  if (
    request.method === 'HEAD' ||
    request.method === 'CONNECT' ||
    nullBodyStatus.includes(response.status) ||
    willFollow
  ) {
    return response.body
  }

  const decoders = []

  for (let i = codings.length - 1; i >= 0; --i) {
    const coding = codings[i]

    // https://www.rfc-editor.org/rfc/rfc9112.html#section-7.2
    if (coding === 'x-gzip' || coding === 'gzip') {
      decoders.push(
        zlib.createGunzip({
          // Be less strict when decoding compressed responses, since sometimes
          // servers send slightly invalid responses that are still accepted
          // by common browsers.
          // Always using Z_SYNC_FLUSH is what cURL does.
          flush: zlib.constants.Z_SYNC_FLUSH,
          finishFlush: zlib.constants.Z_SYNC_FLUSH
        })
      )
    } else if (coding === 'deflate') {
      decoders.push(createInflate())
    } else if (coding === 'br') {
      decoders.push(zlib.createBrotliDecompress())
    } else {
      decoders.length = 0
      break
    }
  }

  if (decoders.length === 0) {
    return response.body
  }

  return pipeline(response.body, ...decoders)
}

module.exports = {
  decompress
}
