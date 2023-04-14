const assert = require('assert')
const {
  ResponseStatusCodeError
} = require('../core/errors')

async function dump (body) {
  let limit = 0
  for await (const chunk of body) {
    limit += chunk.length
    if (limit > 128 * 1024) {
      break
    }
  }
}

async function getResolveErrorBodyCallback ({ callback, body, contentType, statusCode, statusMessage, headers }) {
  assert(body)

  if (statusCode === 204 || !contentType) {
    await dump(body)
    process.nextTick(callback, new ResponseStatusCodeError(`Response status code ${statusCode}${statusMessage ? `: ${statusMessage}` : ''}`, statusCode, headers))
    return
  }

  try {
    if (contentType.startsWith('application/json')) {
      let payload = await body.text()
      try {
        payload = JSON.parse(payload)
      } catch {
        // Ignore
      }
      process.nextTick(callback, new ResponseStatusCodeError(`Response status code ${statusCode}${statusMessage ? `: ${statusMessage}` : ''}`, statusCode, headers, payload))
      return
    }

    if (contentType.startsWith('text/')) {
      const payload = await body.text()
      process.nextTick(callback, new ResponseStatusCodeError(`Response status code ${statusCode}${statusMessage ? `: ${statusMessage}` : ''}`, statusCode, headers, payload))
      return
    }
  } catch (err) {
    // Process in a fallback if error
  }

  await dump(body)

  process.nextTick(callback, new ResponseStatusCodeError(`Response status code ${statusCode}${statusMessage ? `: ${statusMessage}` : ''}`, statusCode, headers))
}

module.exports = { getResolveErrorBodyCallback }
