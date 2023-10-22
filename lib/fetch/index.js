// https://github.com/Ethan-Arrowood/undici-fetch

'use strict'

const { webidl } = require('./webidl')
const { FetchInstance, finalizeAndReportTiming } = require('./fetch-context/FetchInstance')
const { fetching } = require('./fetch-context/fetching')
const { Fetch } = require('./fetch-context/Fetch')

// https://fetch.spec.whatwg.org/#fetch-method
async function fetch (input, init = {}) {
  webidl.argumentLengthCheck(arguments, 1, { header: 'globalThis.fetch' })

  const fetchContext = new FetchInstance(input, init)
  return fetchContext.execute()
}

module.exports = {
  fetch,
  Fetch,
  fetching,
  finalizeAndReportTiming
}
