'use strict'

const { request, errors } = require('../../..')

const acceptableCodes = [
  [() => true, 'ERR_INVALID_URL'],
  // These are included because '\\\\ABC' is interpreted as a Windows UNC path.
  [(buf) => buf.toString().startsWith('\\\\'), 'ENOTFOUND'],
  [(buf) => buf.toString().startsWith('\\\\'), 'EAI_AGAIN'],
  [(buf) => buf.toString().startsWith('\\\\'), 'ECONNREFUSED']
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
    } else if (!acceptableCodes.some(([matchingBuf, code]) => code === err.code && matchingBuf(buf))) {
      console.log(`=== Options: ${JSON.stringify(options)} ===`)
      throw err
    }
  }
}

module.exports = fuzz
