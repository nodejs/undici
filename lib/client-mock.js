'use strict'

const Client = require('./core/client')
const { kUrl } = require('./core/symbols')

const originalDispatch = Client.prototype.dispatch

const mockDispatches = new Map()

function buildKey (url, opts) {
  const { path, method, body } = opts
  return `${method} ${new URL(`${url.href}${path.replace(/^\//, '')}`).href} ${body}`
}

function generateKeyValues (data) {
  return Object.entries(data).reduce((keyValuePairs, [key, value]) => [...keyValuePairs, key, value], [])
}

/**
 * mockDispatch overrides the original dispatch function.
 * This allows us to intercept any socket connections
 * and return defined responses for specified requests.
 */
function mockDispatch (opts, handler) {
  const key = buildKey(this[kUrl], opts)

  // Call the original dispatch if we cannot find the key
  if (!mockDispatches.has(key)) {
    return originalDispatch.bind(this)(opts, handler)
  }

  const [mockDispatchData] = mockDispatches.get(key).filter(data => data.consumed !== true)
  const { statusCode, data, headers, trailers, delay, persist } = mockDispatchData

  // Only mark as consumed if not persisting
  if (!persist) {
    mockDispatchData.consumed = true
  }
  const responseData = typeof data === 'object' ? JSON.stringify(data) : data.toString()
  const responseHeaders = generateKeyValues(headers)
  const responseTrailers = generateKeyValues(trailers)

  // Handle the request with a delay if necessary
  if (typeof delay === 'number' && delay > 0) {
    setTimeout(() => {
      handleResponse()
    }, delay)
  } else {
    handleResponse()
  }

  function handleResponse () {
    handler.onHeaders(statusCode, responseHeaders, resume)
    handler.onData(Buffer.from(responseData))
    handler.onComplete(responseTrailers)

    // Clean up if we cannot find any data that hasn't been consumed
    if (!mockDispatches.get(key).some(data => !data.consumed)) {
      mockDispatches.delete(key)
    }
    // Clean up global mock if mockDispatches is empty
    if (mockDispatches.size === 0) {
      Client.prototype.dispatch = originalDispatch
    }
  }

  function resume () {}
}

class MockClient {
  constructor (url) {
    this.url = new URL(url)
    this.mockDispatchKeys = []

    if (Client.prototype.dispatch.name === 'dispatch') {
      Client.prototype.dispatch = mockDispatch
    }
  }

  intercept (opts) {
    const key = buildKey(this.url, opts)
    return {
      reply: (statusCode, data, responseOptions = {}) => {
        const { headers = {}, trailers = {} } = responseOptions
        const currentDispatchData = mockDispatches.get(key)
        let index = 0
        if (typeof currentDispatchData !== 'undefined') {
          index = currentDispatchData.length
          currentDispatchData.push({ statusCode, data, headers, trailers, persist: false, consumed: false })
        } else {
          mockDispatches.set(key, [{ statusCode, data, headers, trailers, persist: false, consumed: false }])
        }
        this.mockDispatchKeys.push([key, index])
        return {
          delay (waitInMs) {
            mockDispatches.get(key)[index].delay = waitInMs
            return this
          },
          persist () {
            mockDispatches.get(key)[index].persist = true
            return this
          }
        }
      }
    }
  }

  close () {
    for (const [key, index] of this.mockDispatchKeys) {
      if (mockDispatches.has(key) && typeof mockDispatches.get(key)[index] !== 'undefined') {
        mockDispatches.get(key)[index].consumed = true
      }
    }
    if (mockDispatches.size === 0) {
      Client.prototype.dispatch = originalDispatch
    }
  }
}

module.exports.MockClient = MockClient
module.exports.mockDispatch = mockDispatch
