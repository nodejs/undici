'use strict'

const { request } = require('../../..')

const acceptableCodes = [
  'ERR_INVALID_ARG_TYPE',
  'HPE_INVALID_CONSTANT',
  // TODO: work out if this is legit and how we might be able to avoid it
  'UND_ERR_CONNECT_TIMEOUT'
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
    if (!acceptableCodes.includes(err.code)) {
      console.log(`=== Headers: ${JSON.stringify(body)} ===`)
      throw err
    }
  }
}

module.exports = fuzz
