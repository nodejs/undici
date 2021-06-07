'use strict'

const { request, errors } = require('../../..')

const acceptableCodes = [
  'ERR_INVALID_ARG_TYPE'
]

// TODO: could make this a class with some inbuilt functionality that we can inherit
async function fuzz (netServer, results, buf) {
  const body = buf
  results.body = body
  try {
    const data = await request(`http://localhost:${netServer.address().port}`, { body })
    data.body.destroy().on('error', () => {})
  } catch (err) {
    results.err = err
    // Handle any undici errors
    if (Object.values(errors).some(undiciError => err instanceof undiciError)) {
      // Okay error
    } else if (!acceptableCodes.includes(err.code)) {
      console.log(`=== Headers: ${JSON.stringify(body)} ===`)
      throw err
    }
  }
}

module.exports = fuzz
