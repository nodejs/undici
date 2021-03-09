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
  const { statusCode, data, headers, trailers, delay, persist, error } = mockDispatchData

  // Only mark as consumed if not persisting
  if (!persist) {
    mockDispatchData.consumed = true
  }

  if (error !== null) {
    handler.onError(error)
    cleanUpMockDispatch()
    return
  }

  // Handle the request with a delay if necessary
  if (typeof delay === 'number' && delay > 0) {
    setTimeout(() => {
      handleReply()
    }, delay)
  } else {
    handleReply()
  }

  function handleReply () {
    const responseData = typeof data === 'object' ? JSON.stringify(data) : data.toString()
    const responseHeaders = generateKeyValues(headers)
    const responseTrailers = generateKeyValues(trailers)

    handler.onHeaders(statusCode, responseHeaders, resume)
    handler.onData(Buffer.from(responseData))
    handler.onComplete(responseTrailers)
    cleanUpMockDispatch()
  }

  function cleanUpMockDispatch () {
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

function addToMockDispatches (key, { statusCode, data, headers, trailers, error }) {
  const currentDispatchData = mockDispatches.get(key)
  let index = 0
  if (typeof currentDispatchData !== 'undefined') {
    index = currentDispatchData.length
    currentDispatchData.push({ statusCode, data, headers, trailers, error, persist: false, consumed: false })
  } else {
    mockDispatches.set(key, [{ statusCode, data, headers, trailers, error, persist: false, consumed: false }])
  }
  return index
}

function cleanAllMocks () {
  mockDispatches.clear()
}

class MockClientScope {
  constructor (key, index) {
    this.key = key
    this.index = index
  }

  delay (waitInMs) {
    mockDispatches.get(this.key)[this.index].delay = waitInMs
    return this
  }

  persist () {
    mockDispatches.get(this.key)[this.index].persist = true
    return this
  }
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
    const defaultHeaders = {}
    const defaultTrailers = {}

    return {
      reply: (statusCode, data, responseOptions = {}) => {
        const headers = { ...defaultHeaders, ...responseOptions.headers }
        const trailers = { ...defaultTrailers, ...responseOptions.trailers }
        const newDispatchData = { statusCode, data, headers, trailers, error: null, persist: false, consumed: false }

        const index = addToMockDispatches(key, newDispatchData)
        this.mockDispatchKeys.push([key, index])
        return new MockClientScope(key, index)
      },
      replyWithError: (error) => {
        const index = addToMockDispatches(key, { error, persist: false, consumed: false })
        this.mockDispatchKeys.push([key, index])
        return new MockClientScope(key, index)
      }
      // TODO
      // defaultReplyHeaders
      // TODO
      // replyContentLength()
      // TODO
      // .times(4)
      // TODO
      // delayConnection
      // TODO
      // delayBody
      // TODO
      // chaining
      // TODO
      // scope filtering https://github.com/nock/nock#scope-filtering
      // TODO
      // conditional scope filtering
      // TODO
      // path filtering
      // TODO
      // request body filtering
      // TODO
      // pendingMocks()
      // TODO
      // error if not empty when .close() called
      // TODO
      // optionally()
      // TODO
      // {allowUnmocked: true/false}
      // TODO
      // add scope in reply
      // Can be used to determine if it's finished or not
      // TODO
      // .abortPendingRequests()
      // TODO
      // .activeMocks()
      // TODO
      // .isActive()
      // TODO
      // nock.restore()
      // TODO
      // nock.activate()
      // TODO
      // Turn off with env var
      // TODO
      // Disable nock.disableNetConnect()
      // TODO
      // nock.enableNetConnect()
      // nock.enableNetConnect('amazon.com')
      // nock.enableNetConnect(/(amazon|github)\.com/)
      // nock.enableNetConnect(
      //   host => host.includes('amazon.com') || host.includes('github.com')
      // )
      // TODO
      // nock.cleanAll()
      // nock.enableNetConnect()
      // TODO
      // nock.removeInterceptor({
      // TODO

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
module.exports.cleanAllMocks = cleanAllMocks
module.exports.mockDispatch = mockDispatch
