'use strict'

const assert = require('node:assert')
const {
  ResponseStatusCodeError
} = require('../core/errors')

const { chunksDecode } = require('./readable')
/**
 * @type {131072}
 */
const CHUNK_LIMIT = 128 * 1024

/**
 *
 * @param {object} options
 * @param {(err?: Error) => void} options.callback
 * @param {AsyncIterable<Buffer>} options.body
 * @param {string} options.contentType
 * @param {number} options.statusCode
 * @param {string} options.statusMessage
 * @param {object} options.headers
 * @returns
 */
async function getResolveErrorBodyCallback ({
  callback,
  body,
  contentType,
  statusCode,
  statusMessage,
  headers
}) {
  assert(body)

  let chunks = []
  let length = 0

  try {
    for await (const chunk of body) {
      chunks.push(chunk)
      length += chunk.length
      if (length > CHUNK_LIMIT) {
        chunks = []
        length = 0
        break
      }
    }
  } catch {
    chunks = []
    length = 0
    // Do nothing....
  }

  const message = `Response status code ${statusCode}${statusMessage ? `: ${statusMessage}` : ''}`

  if (statusCode === 204 || !contentType || !length) {
    queueMicrotask(() => callback(new ResponseStatusCodeError(message, statusCode, headers)))
    return
  }

  const stackTraceLimit = Error.stackTraceLimit
  Error.stackTraceLimit = 0
  let payload

  try {
    if (isContentTypeApplicationJson(contentType)) {
      payload = JSON.parse(chunksDecode(chunks, length))
    } else if (isContentTypeText(contentType)) {
      payload = chunksDecode(chunks, length)
    }
  } catch {
    // process in a callback to avoid throwing in the microtask queue
  } finally {
    Error.stackTraceLimit = stackTraceLimit
  }
  queueMicrotask(() => callback(new ResponseStatusCodeError(message, statusCode, headers, payload)))
}

/**
 * @param {string} contentType
 * @returns {contentType is `application/json${string}`}`
 */
const isContentTypeApplicationJson = (contentType) => {
  return (
    contentType.length > 15 &&
    contentType[11] === '/' &&
    contentType[0] === 'a' &&
    contentType[1] === 'p' &&
    contentType[2] === 'p' &&
    contentType[3] === 'l' &&
    contentType[4] === 'i' &&
    contentType[5] === 'c' &&
    contentType[6] === 'a' &&
    contentType[7] === 't' &&
    contentType[8] === 'i' &&
    contentType[9] === 'o' &&
    contentType[10] === 'n' &&
    contentType[12] === 'j' &&
    contentType[13] === 's' &&
    contentType[14] === 'o' &&
    contentType[15] === 'n'
  )
}

/**
 * @param {string} contentType
 * @returns {contentType is `text/${string}`}`
 */
const isContentTypeText = (contentType) => {
  return (
    contentType.length > 4 &&
    contentType[4] === '/' &&
    contentType[0] === 't' &&
    contentType[1] === 'e' &&
    contentType[2] === 'x' &&
    contentType[3] === 't'
  )
}

module.exports = {
  getResolveErrorBodyCallback,
  isContentTypeApplicationJson,
  isContentTypeText
}
