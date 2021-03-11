'use strict'

const Client = require('./core/client')
const { kUrl } = require('./core/symbols')

const originalDispatch = Client.prototype.dispatch

const mockDispatches = []

function matchValue (match, value) {
  if (typeof match === 'string') {
    return match === value
  }
  if (match instanceof RegExp) {
    return match.test(value)
  }
  if (typeof match === 'function') {
    return match(value) === true
  }
  return false
}

function buildMatcher ({ url, path, method, body }) {
  return (mockDispatch) => {
    const urlMatch = matchValue(mockDispatch.url, url)
    const pathMatch = matchValue(mockDispatch.path, path)
    const methodMatch = matchValue(mockDispatch.method, method)
    const bodyMatch = typeof mockDispatch.body !== 'undefined' ? matchValue(mockDispatch.body, body) : true

    return urlMatch && pathMatch && methodMatch && bodyMatch
  }
}

function getResponseData (data) {
  return typeof data === 'object' ? JSON.stringify(data) : data.toString()
}

function getMockDispatch (key) {
  return mockDispatches.find(buildMatcher(key))
}

function addMockDispatch (key, data) {
  const baseData = { error: null, times: null, persist: false, consumed: false }
  const currentMockDispatch = getMockDispatch(key)
  const index = 0
  if (typeof currentMockDispatch !== 'undefined') {
    currentMockDispatch.replies.push({ ...baseData, ...data })
  } else {
    mockDispatches.push({ ...key, replies: [{ ...baseData, ...data }] })
  }
  return index
}

function deleteMockDispatch (key) {
  const index = mockDispatches.findIndex(buildMatcher(key))
  if (index !== -1) {
    mockDispatches.splice(index, 1)
  }
}

function buildKey (url, opts) {
  const { path, method, body } = opts
  return {
    url: url instanceof URL ? url.origin : url,
    path: path,
    method: method,
    body: body
  }
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
  const mockDispatch = getMockDispatch(key)

  // Call the original dispatch if we cannot find the key
  if (!mockDispatch) {
    return originalDispatch.bind(this)(opts, handler)
  }

  const [mockDispatchData] = mockDispatch.replies.filter(data => data.consumed !== true)
  const { statusCode, data, headers, trailers, delay, persist, error } = mockDispatchData
  let { times } = mockDispatchData

  if (typeof times === 'number' && times > 0) {
    times = --mockDispatchData.times
  }

  // If persist is true, skip
  // Or if times is a number and > 0, skip
  // Otherwise, mark as consumed
  if (!(persist === true || (typeof times === 'number' && times > 0))) {
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
    const responseData = getResponseData(data)
    const responseHeaders = generateKeyValues(headers)
    const responseTrailers = generateKeyValues(trailers)

    handler.onHeaders(statusCode, responseHeaders, resume)
    handler.onData(Buffer.from(responseData))
    handler.onComplete(responseTrailers)
    cleanUpMockDispatch()
  }

  function cleanUpMockDispatch () {
    // Clean up if we cannot find any data that hasn't been consumed
    if (!getMockDispatch(key).replies.some(data => !data.consumed)) {
      deleteMockDispatch(key)
    }
    // Clean up global mock if mockDispatches is empty
    if (mockDispatches.length === 0) {
      Client.prototype.dispatch = originalDispatch
    }
  }

  function resume () {}
}

/**
 * Clear any remaining mocks.
 */
function cleanAllMocks () {
  // TODO: check that this is garbage collected properly
  mockDispatches.splice(0, mockDispatches.length)
}

function getAllMocks () {
  return mockDispatches
}

function deactivateMocks () {
  Client.prototype.dispatch = originalDispatch
}

function activateMocks () {
  Client.prototype.dispatch = mockDispatch
}

/**
 * Defines the scope API for a interceptor reply
 */
class MockScope {
  constructor (key, index) {
    this.key = key
    this.index = index
  }

  /**
   * Delay a reply by a set amount in ms.
   */
  delay (waitInMs) {
    getMockDispatch(this.key).replies[this.index].delay = waitInMs
    return this
  }

  /**
   * For a defined reply, never mark as consumed.
   */
  persist () {
    getMockDispatch(this.key).replies[this.index].persist = true
    return this
  }

  /**
   * Allow one to define a reply for a set amount of matching requests.
   */
  times (repeatTimes) {
    getMockDispatch(this.key).replies[this.index].times = repeatTimes
    return this
  }
}

class MockInterceptor {
  constructor (url, opts, mockDispatchKeys) {
    this.key = buildKey(url, opts)
    this.defaultHeaders = {}
    this.defaultTrailers = {}
    this.contentLength = false
    this.mockDispatchKeys = mockDispatchKeys
  }

  /**
   * Mock an undici Client request with a defined reply.
   */
  reply (statusCode, data, responseOptions = {}) {
    const responseData = getResponseData(data)
    const contentLength = this.contentLength ? { 'content-length': responseData.length } : {}
    const headers = { ...this.defaultHeaders, ...contentLength, ...responseOptions.headers }
    const trailers = { ...this.defaultTrailers, ...responseOptions.trailers }
    const index = addMockDispatch(this.key, { statusCode, data, headers, trailers })
    this.mockDispatchKeys.push([this.key, index])
    return new MockScope(this.key, index)
  }

  /**
   * Mock an undici Client request with a defined error.
   */
  replyWithError (error) {
    const index = addMockDispatch(this.key, { error })
    this.mockDispatchKeys.push([this.key, index])
    return new MockScope(this.key, index)
  }

  /**
   * Set default reply headers on the interceptor for subsequent replies
   */
  defaultReplyHeaders (headers) {
    this.defaultHeaders = headers
    return this
  }

  /**
   * Set default reply trailers on the interceptor for subsequent replies
   */
  defaultReplyTrailers (trailers) {
    this.defaultTrailers = trailers
    return this
  }

  /**
   * Set default reply content length header for replies on the interceptor
   */
  replyContentLength () {
    this.contentLength = true
    return this
  }
}

/**
 * MockClient provides an API to influence the mockDispatches.
 */
class MockClient {
  constructor (url) {
    this.url = typeof url === 'string' ? new URL(url) : url
    this.mockDispatchKeys = []

    if (process.env.UNDICI_CLIENT_MOCK_OFF === 'true') {
      Client.prototype.dispatch = originalDispatch
    } else if (Client.prototype.dispatch.name === 'dispatch') {
      Client.prototype.dispatch = mockDispatch
    }
  }

  /**
   * Sets up the base interceptor for mocking replies from undici.
   */
  intercept (opts) {
    return new MockInterceptor(this.url, opts, this.mockDispatchKeys)
  }

  /**
   * Clean up the Mock Client interceptors when called.
   */
  close () {
    for (const [key, index] of this.mockDispatchKeys) {
      const foundDispatch = getMockDispatch(key)
      if (typeof foundDispatch !== 'undefined' && typeof foundDispatch.replies[index] !== 'undefined') {
        foundDispatch.replies[index].consumed = true
        if (!foundDispatch.replies.some(reply => !reply.consumed)) {
          mockDispatches.splice(index, 1)
        }
      }
    }
    if (mockDispatches.length === 0) {
      Client.prototype.dispatch = originalDispatch
    }
  }
}

module.exports.MockClient = MockClient
module.exports.cleanAllMocks = cleanAllMocks
module.exports.mockDispatch = mockDispatch
module.exports.addMockDispatch = addMockDispatch
module.exports.deleteMockDispatch = deleteMockDispatch
module.exports.getMockDispatch = getMockDispatch
module.exports.getAllMocks = getAllMocks
module.exports.activateMocks = activateMocks
module.exports.deactivateMocks = deactivateMocks
