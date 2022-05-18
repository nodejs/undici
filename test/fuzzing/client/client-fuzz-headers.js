'use strict'

const { request, errors } = require('../../..')

const acceptableCodes = [
  'ERR_INVALID_ARG_TYPE'
]

async function fuzz (netServer, results, buf) {
  const headers = { buf: buf.toString() }
  results.body = headers
  try {
    const data = await request(`http://localhost:${netServer.address().port}`, { headers })
    data.body.destroy().on('error', () => {})
  } catch (err) {
    results.err = err
    // Handle any undici errors
    if (Object.values(errors).some(undiciError => err instanceof undiciError)) {
      // Okay error
    } else if (!acceptableCodes.includes(err.code)) {
      console.log(`=== Headers: ${JSON.stringify(headers)} ===`)
      throw err
    }
  }
}

module.exports = fuzz
