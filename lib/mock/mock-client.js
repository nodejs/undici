'use strict'

const Client = require('../core/client')
const { kUrl } = require('../core/symbols')
const {
  getResponseData,
  buildKey,
  matchValue,
  generateKeyValues,
  getMockDispatch,
  deleteMockDispatch,
  addMockDispatch
} = require('./mock-utils')
const {
  kDispatch,
  kDispatches,
  kDispatchIndex,
  kDispatchKey,
  kDefaultHeaders,
  kDefaultTrailers,
  kContentLength,
  kMockClient,
  kMockClientUrl
} = require('./mock-symbols')

const originalDispatch = Client.prototype.dispatch

const mockClients = new Map()

let netConnect = true

function buildMockClientDispatch () {
  return function mockDispatch (opts, handler) {
    let consumed
    for (const [, fn] of Array.from(mockClients)) {
      if (consumed !== true) {
        consumed = fn[kDispatch](this[kUrl], opts, handler)
      }
    }
    if (consumed !== true) {
      originalDispatch.bind(this)(opts, handler)
    }
  }
}

/**
 * Defines the scope API for a interceptor reply
 */
class MockScope {
  constructor (mockDispatches, key, index) {
    this[kDispatches] = mockDispatches
    this[kDispatchKey] = key
    this[kDispatchIndex] = index
  }

  /**
   * Delay a reply by a set amount in ms.
   */
  delay (waitInMs) {
    getMockDispatch(this[kDispatches], this[kDispatchKey]).replies[this[kDispatchIndex]].delay = waitInMs
    return this
  }

  /**
   * For a defined reply, never mark as consumed.
   */
  persist () {
    getMockDispatch(this[kDispatches], this[kDispatchKey]).replies[this[kDispatchIndex]].persist = true
    return this
  }

  /**
   * Allow one to define a reply for a set amount of matching requests.
   */
  times (repeatTimes) {
    getMockDispatch(this[kDispatches], this[kDispatchKey]).replies[this[kDispatchIndex]].times = repeatTimes
    return this
  }
}

/**
 * Defines an interceptor for a MockClient
 */
class MockInterceptor {
  constructor (url, opts, mockDispatches) {
    this[kDispatchKey] = buildKey(url, opts)
    this[kDefaultHeaders] = {}
    this[kDefaultTrailers] = {}
    this[kContentLength] = false
    this[kDispatches] = mockDispatches
  }

  /**
   * Mock an undici Client request with a defined reply.
   */
  reply (statusCode, data, responseOptions = {}) {
    const responseData = getResponseData(data)
    const contentLength = this[kContentLength] ? { 'content-length': responseData.length } : {}
    const headers = { ...this[kDefaultHeaders], ...contentLength, ...responseOptions.headers }
    const trailers = { ...this[kDefaultTrailers], ...responseOptions.trailers }
    const index = addMockDispatch(this[kDispatches], this[kDispatchKey], { statusCode, data, headers, trailers })
    return new MockScope(this[kDispatches], this[kDispatchKey], index)
  }

  /**
   * Mock an undici Client request with a defined error.
   */
  replyWithError (error) {
    const index = addMockDispatch(this[kDispatches], this[kDispatchKey], { error })
    return new MockScope(this[kDispatches], this[kDispatchKey], index)
  }

  /**
   * Set default reply headers on the interceptor for subsequent replies
   */
  defaultReplyHeaders (headers) {
    this[kDefaultHeaders] = headers
    return this
  }

  /**
   * Set default reply trailers on the interceptor for subsequent replies
   */
  defaultReplyTrailers (trailers) {
    this[kDefaultTrailers] = trailers
    return this
  }

  /**
   * Set default reply content length header for replies on the interceptor
   */
  replyContentLength () {
    this[kContentLength] = true
    return this
  }
}

/**
 * MockClient provides an API to influence the mockDispatches.
 */
class MockClient {
  constructor (url) {
    this[kMockClientUrl] = typeof url === 'string' ? new URL(url) : url
    this[kDispatches] = []
    this[kMockClient] = Symbol('MockClientInstance')
    mockClients.set(this[kMockClient], this)

    if (process.env.UNDICI_CLIENT_MOCK_OFF === 'true') {
      Client.prototype.dispatch = originalDispatch
    } else if (Client.prototype.dispatch.name === 'dispatch') {
      Client.prototype.dispatch = buildMockClientDispatch()
    }
  }

  /**
   * Sets up the base interceptor for mocking replies from undici.
   */
  intercept (opts) {
    return new MockInterceptor(this[kMockClientUrl], opts, this[kDispatches])
  }

  /**
   * Clean up the Mock Client interceptors when called.
   */
  close () {
    this[kDispatches].splice(0, this[kDispatches].length)
    mockClients.delete(this[kMockClient])
    if (mockClients.size === 0) {
      Client.prototype.dispatch = originalDispatch
    }
  }

  static closeAll () {
    mockClients.clear()
    MockClient.enableNetConnect()
  }

  static getAllDispatches () {
    return [].concat(...Array.from(mockClients).map(([, mockClient]) => mockClient[kDispatches]))
  }

  static deactivate () {
    Client.prototype.dispatch = originalDispatch
  }

  static activate () {
    Client.prototype.dispatch = buildMockClientDispatch()
  }

  static enableNetConnect (matcher) {
    if (typeof matcher === 'string' || typeof matcher === 'function' || matcher instanceof RegExp) {
      if (Array.isArray(netConnect)) {
        netConnect.push(matcher)
      } else {
        netConnect = [matcher]
      }
    } else if (typeof matcher === 'undefined') {
      netConnect = true
    } else {
      throw new Error('Unsupported matcher. Must be one of String|Function|RegExp.')
    }
  }

  static disableNetConnect () {
    netConnect = false
  }

  [kDispatch] (url, opts, handler) {
    const key = buildKey(url, opts)
    const mockDispatch = getMockDispatch(this[kDispatches], key)

    // Call the original dispatch if we cannot find the key
    // If not found but netConnect is enabled for expression
    if (!mockDispatch) {
      if (netConnect === true) {
        return false
      }
      if (Array.isArray(netConnect) && netConnect.some((matcher) => matchValue(matcher, url.host))) {
        return false
      }
      handler.onError(new Error(`Unable to find mock dispatch and real dispatches are disabled for host ${url.host}`))
      cleanUpMockDispatch(this[kDispatches])
      return true
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
      cleanUpMockDispatch(this[kDispatches])
      return true
    }

    // Handle the request with a delay if necessary
    if (typeof delay === 'number' && delay > 0) {
      setTimeout(() => {
        handleReply(this[kDispatches])
      }, delay)
    } else {
      handleReply(this[kDispatches])
    }

    function handleReply (mockDispatches) {
      const responseData = getResponseData(data)
      const responseHeaders = generateKeyValues(headers)
      const responseTrailers = generateKeyValues(trailers)

      handler.onHeaders(statusCode, responseHeaders, resume)
      handler.onData(Buffer.from(responseData))
      handler.onComplete(responseTrailers)
      cleanUpMockDispatch(mockDispatches)
    }

    function cleanUpMockDispatch (mockDispatches) {
      // Clean up if we cannot find any data that hasn't been consumed
      const foundMockDispatch = getMockDispatch(mockDispatches, key)
      if (foundMockDispatch && !foundMockDispatch.replies.some(data => !data.consumed)) {
        deleteMockDispatch(mockDispatches, key)
      }
    }

    function resume () {}

    return true
  }
}

module.exports = MockClient
