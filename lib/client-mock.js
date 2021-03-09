'use strict'

const Client = require('./core/client')
const { kUrl } = require('./core/symbols')

const originalDispatch = Client.prototype.dispatch

const mockDispatches = []

function getMockDispatch (key) {
  const { url, path, method, body } = key
  return mockDispatches.find((mockDispatch) => {
    const urlMatch = url === mockDispatch.url
    const pathMatch = path === mockDispatch.path
    const methodMatch = method === mockDispatch.method
    const bodyMatch = typeof mockDispatch.body !== 'undefined' ? body === mockDispatch.body : true

    return urlMatch && pathMatch && methodMatch && bodyMatch
  })
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
  const { url, path, method, body } = key
  const index = mockDispatches.findIndex((mockDispatch) => {
    const urlMatch = url === mockDispatch.url
    const pathMatch = path === mockDispatch.path
    const methodMatch = method === mockDispatch.method
    const bodyMatch = typeof mockDispatch.body !== 'undefined' ? body === mockDispatch.body : true

    return urlMatch && pathMatch && methodMatch && bodyMatch
  })
  if (index !== -1) {
    mockDispatches.splice(index, 1)
  }
}

function buildKey (url, opts) {
  const { path, method, body } = opts
  return {
    url: url.href,
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

function cleanAllMocks () {
  // TODO: check that this is garbage collected properly
  mockDispatches.splice(0, mockDispatches.length)
}

class MockClientScope {
  constructor (key, index) {
    this.key = key
    this.index = index
  }

  delay (waitInMs) {
    getMockDispatch(this.key).replies[this.index].delay = waitInMs
    return this
  }

  persist () {
    getMockDispatch(this.key).replies[this.index].persist = true
    return this
  }

  times (repeatTimes) {
    getMockDispatch(this.key).replies[this.index].times = repeatTimes
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
        const index = addMockDispatch(key, { statusCode, data, headers, trailers })
        this.mockDispatchKeys.push([key, index])
        return new MockClientScope(key, index)
      },
      replyWithError: (error) => {
        const index = addMockDispatch(key, { error })
        this.mockDispatchKeys.push([key, index])
        return new MockClientScope(key, index)
      }
      // TODO
      // path filtering
      // TODO
      // request body filtering
      // TODO
      // defaultReplyHeaders
      // TODO
      // replyContentLength()
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
      const foundDispatch = getMockDispatch(key)
      if (typeof foundDispatch !== 'undefined' && typeof foundDispatch.replies[index] !== 'undefined') {
        foundDispatch.replies[index].consumed = true
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
