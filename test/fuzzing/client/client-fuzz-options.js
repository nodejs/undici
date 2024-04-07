'use strict'

const { request, errors } = require('../../..')

const acceptableCodes = [
  'ERR_INVALID_URL',
  // These are included because '\\ABC' is interpreted as a Windows UNC path and can cause these errors.
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED'
]

async function fuzz (address, results, buf) {
  const optionKeys = ['body', 'path', 'method', 'opaque', 'upgrade', buf]
  const options = {}
  for (const optionKey of optionKeys) {
    if (Math.random() < 0.5) {
      options[optionKey] = buf.toString()
    }
  }
  results.options = options
  try {
    const data = await request(address, options)
    data.body.destroy().on('error', () => {})
  } catch (err) {
    results.err = err
    // Handle any undici errors
    if (Object.values(errors).some(undiciError => err instanceof undiciError)) {
      // Okay error
    } else if (!acceptableCodes.includes(err.code)) {
      throw err
    }
  }
}

module.exports = fuzz
