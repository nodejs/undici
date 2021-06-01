'use strict'

const { request } = require('../../..')

const acceptableCodes = [
  'ERR_INVALID_ARG_TYPE',
  'HPE_INVALID_HEADER_TOKEN',
  'HPE_LF_EXPECTED',
  // TODO: work out if this is legit and how we might be able to avoid it
  'UND_ERR_CONNECT_TIMEOUT'
]

async function fuzz (netServer, results, buf) {
  const headers = { buf: buf.toString() }
  results.body = headers
  try {
    const data = await request(`http://localhost:${netServer.address().port}`, { headers })
    data.body.destroy().on('error', () => {})
  } catch (err) {
    results.err = err
    if (!acceptableCodes.includes(err.code)) {
      console.log(`=== Headers: ${JSON.stringify(headers)} ===`)
      throw err
    }
  }
}

module.exports = fuzz
