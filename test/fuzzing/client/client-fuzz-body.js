'use strict'

const { request, errors } = require('../../..')

const acceptableCodes = [
  'ERR_INVALID_ARG_TYPE'
]

async function fuzz (address, results, buf) {
  const body = buf
  results.body = body
  try {
    const data = await request(address, { body })
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
