const assert = require('node:assert')
const {
  ResponseStatusCodeError
} = require('../core/errors')

const { chunksDecode } = require('./readable')
const CHUNK_LIMIT = 128 * 1024

async function getResolveErrorBodyCallback ({ callback, body, contentType, statusCode, statusMessage, headers }) {
  assert(body)

  let chunks = []
  let length = 0

  for await (const chunk of body) {
    chunks.push(chunk)
    length += chunk.length
    if (length > CHUNK_LIMIT) {
      chunks = null
      break
    }
  }

  if (statusCode === 204 || !contentType || !chunks) {
    process.nextTick(callback, new ResponseStatusCodeError(`Response status code ${statusCode}${statusMessage ? `: ${statusMessage}` : ''}`, statusCode, headers))
    return
  }

  try {
    if (contentType.startsWith('application/json')) {
      const payload = JSON.parse(chunksDecode(chunks, length))
      process.nextTick(callback, new ResponseStatusCodeError(`Response status code ${statusCode}${statusMessage ? `: ${statusMessage}` : ''}`, statusCode, headers, payload))
      return
    }

    if (contentType.startsWith('text/')) {
      const payload = chunksDecode(chunks, length)
      process.nextTick(callback, new ResponseStatusCodeError(`Response status code ${statusCode}${statusMessage ? `: ${statusMessage}` : ''}`, statusCode, headers, payload))
      return
    }
  } catch (err) {
    // Process in a fallback if error
  }

  process.nextTick(callback, new ResponseStatusCodeError(`Response status code ${statusCode}${statusMessage ? `: ${statusMessage}` : ''}`, statusCode, headers))
}

module.exports = { getResolveErrorBodyCallback }
