'use strict'

const { kDispatches } = require('./mock-symbols')

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

function buildMatcher ({ path, method, body }) {
  return (mockDispatch) => {
    const pathMatch = matchValue(mockDispatch.path, path)
    const methodMatch = matchValue(mockDispatch.method, method)
    const bodyMatch = typeof mockDispatch.body !== 'undefined' ? matchValue(mockDispatch.body, body) : true
    return pathMatch && methodMatch && bodyMatch
  }
}

function getResponseData (data) {
  return typeof data === 'object' ? JSON.stringify(data) : data.toString()
}

function getMockDispatch (mockDispatches, key) {
  const matcher = buildMatcher(key)
  return mockDispatches.find(dispatch => {
    if (dispatch.consumed) {
      return false
    }
    return matcher(dispatch)
  })
}

function addMockDispatch (mockDispatches, key, data) {
  const baseData = { times: null, persist: false, consumed: false }
  const newMockDispatch = { ...baseData, ...key, data: { error: null, ...data } }
  mockDispatches.push(newMockDispatch)
  return newMockDispatch
}

function deleteMockDispatch (mockDispatches, key) {
  const index = mockDispatches.findIndex(dispatch => {
    if (!dispatch.consumed) {
      return false
    }
    return buildMatcher(key)
  })
  if (index !== -1) {
    mockDispatches.splice(index, 1)
  }
}

function buildKey (opts) {
  const { path, method, body } = opts
  return {
    path: path,
    method: method,
    body: body
  }
}

function generateKeyValues (data) {
  return Object.entries(data).reduce((keyValuePairs, [key, value]) => [...keyValuePairs, key, value], [])
}

async function getResponse (body) {
  const buffers = []
  for await (const data of body) {
    buffers.push(data)
  }
  return Buffer.concat(buffers).toString('utf8')
}

/**
 * Mock dispatch function used to simulate undici dispatches
 */
function mockDispatch (opts, handler) {
  // Get mock dispatch from built key
  const key = buildKey(opts)
  const mockDispatch = getMockDispatch(this[kDispatches], key)

  if (!mockDispatch) {
    return false
  }

  // Parse mockDispatch data
  const { data: { statusCode, data, headers, trailers, error }, delay, persist } = mockDispatch
  let { times } = mockDispatch
  if (typeof times === 'number' && times > 0) {
    times = --mockDispatch.times
  }

  // If persist is true, skip
  // Or if times is a number and > 0, skip
  // Otherwise, mark as consumed

  if (!(persist === true || (typeof times === 'number' && times > 0))) {
    mockDispatch.consumed = true
  }

  // If specified, trigger dispatch error
  if (error !== null) {
    deleteMockDispatch(this[kDispatches], key)
    handler.onError(error)
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
    deleteMockDispatch(mockDispatches, key)
  }

  function resume () {}

  return true
}

function checkNetConnect (netConnect, origin) {
  const url = new URL(origin)
  if (netConnect === true) {
    return true
  } else if (Array.isArray(netConnect) && netConnect.some((matcher) => matchValue(matcher, url.host))) {
    return true
  }
  return false
}

module.exports = {
  getResponseData,
  getMockDispatch,
  addMockDispatch,
  deleteMockDispatch,
  buildKey,
  generateKeyValues,
  matchValue,
  getResponse,
  mockDispatch,
  checkNetConnect
}
