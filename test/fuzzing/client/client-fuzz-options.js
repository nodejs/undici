'use strict'

const { request, errors } = require('../../..')

const acceptableCodes = [
  'ERR_INVALID_URL',
  // These are currently included because '\\\\ABC' is interpreted as a Windows UNC path.
  // TODO: Confirmation of whether this is a legitimate issue or not will be resolved in: https://github.com/nodejs/node/issues/38963
  // Upon resolution, these entries will either be kept for this specific error case or removed when the issue is fixed.
  'ENOTFOUND',
  'EAI_AGAIN'
  // ----
]

async function fuzz (netServer, results, buf) {
  const optionKeys = ['body', 'path', 'method', 'opaque', 'upgrade', buf]
  const options = {}
  for (const optionKey of optionKeys) {
    if (Math.random() < 0.5) {
      options[optionKey] = buf.toString()
    }
  }
  results.options = options
  try {
    const data = await request(`http://localhost:${netServer.address().port}`, options)
    data.body.destroy().on('error', () => {})
  } catch (err) {
    results.err = err
    // Handle any undici errors
    if (Object.values(errors).some(undiciError => err instanceof undiciError)) {
      // Okay error
    } else if (!acceptableCodes.includes(err.code)) {
      console.log(`=== Options: ${JSON.stringify(options)} ===`)
      throw err
    }
  }
}

module.exports = fuzz
