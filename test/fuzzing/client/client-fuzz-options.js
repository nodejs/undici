'use strict'

const { request } = require('../../..')

const acceptableCodes = [
  'UND_ERR_INVALID_ARG',
  'ERR_INVALID_URL',
  'HPE_INVALID_HEADER_TOKEN',
  'ENOTFOUND',
  // TODO: work out if this is legit and how we might be able to avoid it
  'UND_ERR_CONNECT_TIMEOUT'
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
    if (!acceptableCodes.includes(err.code)) {
      console.log(`=== Options: ${JSON.stringify(options)} ===`)
      throw err
    }
  }
}

module.exports = fuzz
