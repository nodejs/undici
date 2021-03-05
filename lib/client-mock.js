'use strict'

const Client = require('./core/client')
const { kUrl } = require('./core/symbols')

const originalDispatch = Client.prototype.dispatch

const mockDispatches = new Map()

/**
 * mockDispatch overrides the original dispatch function.
 * This allows us to intercept any socket connections
 * and return defined responses for specified requests.
 */
function mockDispatch (opts, handler) {
  const { path, method } = opts
  const key = `${method} ${new URL(`${this[kUrl].href}${path}`).href}`

  // Call the original dispatch if we cannot find the key
  if (!mockDispatches.has(key)) {
    return originalDispatch.bind(this)(opts, handler)
  }

  const [mockDispatchData, ...remainingDispatchData] = mockDispatches.get(key)
  // TODO: add request persist and consumed instead of always deleting
  mockDispatches.set(key, remainingDispatchData)

  const { statusCode, data, headers } = mockDispatchData
  const responseData = typeof data === 'object' ? JSON.stringify(data) : data
  const responseHeaders = Object.entries(headers).reduce((allHeaders, [key, header]) => [...allHeaders, key, header], [])
  const trailers = { some: 'trailer' }

  // Handle the request
  handler.onHeaders(statusCode, responseHeaders, resume)
  // TODO: add a timeout case
  handler.onData(responseData)
  handler.onComplete(trailers)

  // Clean up
  if (remainingDispatchData.length === 0) {
    mockDispatches.delete(key)
  }
  if (mockDispatches.size === 0) {
    Client.prototype.dispatch = originalDispatch
  }

  function resume () {}
}

class MockClient {
  constructor (url) {
    this.url = new URL(url)
    this.mockDispatchKeys = []

    // TODO: check if it's already assigned to the mock dispatch
    Client.prototype.dispatch = mockDispatch
  }

  // TODO: Basic validation checks
  intercept (opts) {
    return {
      // TODO: Basic validation checks
      reply: (statusCode, data, responseOptions = {}) => {
        const { headers = {} } = responseOptions
        const { path, method } = opts
        const key = `${method} ${new URL(`${this.url.href}${path}`).href}`
        this.mockDispatchKeys.push(key)

        if (mockDispatches.has(key)) {
          mockDispatches.get(key).push({ statusCode, data, headers })
        } else {
          mockDispatches.set(key, [{ statusCode, data, headers }])
        }
      }
    }
  }

  close () {
    // TODO: We can use this.mockDispatchKeys a bit better by deleting and removing by key
    // for (const key of this.mockDispatchKeys) {
    //   if (mockDispatches.has(key) && mockDispatches.get(key).length === 0) {
    //     mockDispatches.delete(key)
    //   }
    // }
    if (mockDispatches.size === 0) {
      Client.prototype.dispatch = originalDispatch
    }
  }
}

module.exports.MockClient = MockClient
module.exports.mockDispatch = mockDispatch
