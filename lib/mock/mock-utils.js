'use strict'

const { MockNotMatchedError } = require('./mock-errors')
const {
  kDispatches,
  kMockAgent,
  kOriginalDispatch,
  kOrigin,
  kGetNetConnect,
  kOptions
} = require('./mock-symbols')
const { serializePathWithQuery } = require('../core/util')
const { STATUS_CODES } = require('node:http')
const {
  types: {
    isPromise
  }
} = require('node:util')
const { InvalidArgumentError } = require('../core/errors')
const PendingInterceptorsFormatter = require('./pending-interceptors-formatter')

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

function lowerCaseEntries (headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([headerName, headerValue]) => {
      return [headerName.toLocaleLowerCase(), headerValue]
    })
  )
}

/**
 * @param {import('../../index').Headers|string[]|Record<string, string>} headers
 * @param {string} key
 */
function getHeaderByName (headers, key) {
  if (Array.isArray(headers)) {
    for (let i = 0; i < headers.length; i += 2) {
      if (headers[i].toLocaleLowerCase() === key.toLocaleLowerCase()) {
        return headers[i + 1]
      }
    }

    return undefined
  } else if (typeof headers.get === 'function') {
    return headers.get(key)
  } else {
    return lowerCaseEntries(headers)[key.toLocaleLowerCase()]
  }
}

/** @param {string[]} headers */
function buildHeadersFromArray (headers) { // fetch HeadersList
  const clone = headers.slice()
  const entries = []
  for (let index = 0; index < clone.length; index += 2) {
    entries.push([clone[index], clone[index + 1]])
  }
  return Object.fromEntries(entries)
}

function matchHeaders (mockDispatch, headers) {
  if (typeof mockDispatch.headers === 'function') {
    if (Array.isArray(headers)) { // fetch HeadersList
      headers = buildHeadersFromArray(headers)
    }
    return mockDispatch.headers(headers ? lowerCaseEntries(headers) : {})
  }
  if (typeof mockDispatch.headers === 'undefined') {
    return true
  }
  if (typeof headers !== 'object' || typeof mockDispatch.headers !== 'object') {
    return false
  }

  for (const [matchHeaderName, matchHeaderValue] of Object.entries(mockDispatch.headers)) {
    const headerValue = getHeaderByName(headers, matchHeaderName)

    if (!matchValue(matchHeaderValue, headerValue)) {
      return false
    }
  }
  return true
}

function normalizeSearchParams (query) {
  if (typeof query !== 'string') {
    return query
  }

  const originalQp = new URLSearchParams(query)
  const normalizedQp = new URLSearchParams()

  for (let [key, value] of originalQp.entries()) {
    key = key.replace('[]', '')

    const valueRepresentsString = /^(['"]).*\1$/.test(value)
    if (valueRepresentsString) {
      normalizedQp.append(key, value)
      continue
    }

    if (value.includes(',')) {
      const values = value.split(',')
      for (const v of values) {
        normalizedQp.append(key, v)
      }
      continue
    }

    normalizedQp.append(key, value)
  }

  return normalizedQp
}

function safeUrl (path) {
  if (typeof path !== 'string') {
    return path
  }
  const pathSegments = path.split('?', 3)
  if (pathSegments.length !== 2) {
    return path
  }

  const qp = new URLSearchParams(pathSegments.pop())
  qp.sort()
  return [...pathSegments, qp.toString()].join('?')
}

function matchKey (mockDispatch, { path, method, body, headers }) {
  const pathMatch = matchValue(mockDispatch.path, path)
  const methodMatch = matchValue(mockDispatch.method, method)
  const bodyMatch = typeof mockDispatch.body !== 'undefined' ? matchValue(mockDispatch.body, body) : true
  const headersMatch = matchHeaders(mockDispatch, headers)
  return pathMatch && methodMatch && bodyMatch && headersMatch
}

function getResponseData (data) {
  if (Buffer.isBuffer(data)) {
    return data
  } else if (data instanceof Uint8Array) {
    return data
  } else if (data instanceof ArrayBuffer) {
    return data
  } else if (typeof data === 'object') {
    return JSON.stringify(data)
  } else if (data) {
    return data.toString()
  } else {
    return ''
  }
}

function getMockDispatch (mockDispatches, key, origin) {
  const basePath = key.query ? serializePathWithQuery(key.path, key.query) : key.path
  const resolvedPath = typeof basePath === 'string' ? safeUrl(basePath) : basePath

  const resolvedPathWithoutTrailingSlash = removeTrailingSlash(resolvedPath)

  const request = {
    method: key.method,
    path: resolvedPath,
    body: key.body,
    headers: key.headers
  }

  // Match path
  let matchedMockDispatches = mockDispatches
    .filter(({ consumed }) => !consumed)
    .filter(({ path, ignoreTrailingSlash }) => {
      return ignoreTrailingSlash
        ? matchValue(removeTrailingSlash(safeUrl(path)), resolvedPathWithoutTrailingSlash)
        : matchValue(safeUrl(path), resolvedPath)
    })
  if (matchedMockDispatches.length === 0) {
    const message = origin
      ? buildEnhancedErrorMessage('path', request, mockDispatches, origin, resolvedPath)
      : `Mock dispatch not matched for path '${resolvedPath}'`
    throw new MockNotMatchedError(message)
  }

  // Match method
  matchedMockDispatches = matchedMockDispatches.filter(({ method }) => matchValue(method, key.method))
  if (matchedMockDispatches.length === 0) {
    const message = origin
      ? buildEnhancedErrorMessage('method', request, mockDispatches, origin, resolvedPath)
      : `Mock dispatch not matched for method '${key.method}' on path '${resolvedPath}'`
    throw new MockNotMatchedError(message)
  }

  // Match body
  matchedMockDispatches = matchedMockDispatches.filter(({ body }) => typeof body !== 'undefined' ? matchValue(body, key.body) : true)
  if (matchedMockDispatches.length === 0) {
    const message = origin
      ? buildEnhancedErrorMessage('body', request, mockDispatches, origin, resolvedPath)
      : `Mock dispatch not matched for body '${key.body}' on path '${resolvedPath}'`
    throw new MockNotMatchedError(message)
  }

  // Match headers
  matchedMockDispatches = matchedMockDispatches.filter((mockDispatch) => matchHeaders(mockDispatch, key.headers))
  if (matchedMockDispatches.length === 0) {
    const message = origin
      ? buildEnhancedErrorMessage('headers', request, mockDispatches, origin, resolvedPath)
      : `Mock dispatch not matched for headers '${typeof key.headers === 'object' ? JSON.stringify(key.headers) : key.headers}' on path '${resolvedPath}'`
    throw new MockNotMatchedError(message)
  }

  return matchedMockDispatches[0]
}

function addMockDispatch (mockDispatches, key, data, opts) {
  const baseData = { timesInvoked: 0, times: 1, persist: false, consumed: false, ...opts }
  const replyData = typeof data === 'function' ? { callback: data } : { ...data }
  const newMockDispatch = { ...baseData, ...key, pending: true, data: { error: null, ...replyData } }
  mockDispatches.push(newMockDispatch)
  return newMockDispatch
}

function deleteMockDispatch (mockDispatches, key) {
  const index = mockDispatches.findIndex(dispatch => {
    if (!dispatch.consumed) {
      return false
    }
    return matchKey(dispatch, key)
  })
  if (index !== -1) {
    mockDispatches.splice(index, 1)
  }
}

/**
 * @param {string} path Path to remove trailing slash from
 */
function removeTrailingSlash (path) {
  while (path.endsWith('/')) {
    path = path.slice(0, -1)
  }

  if (path.length === 0) {
    path = '/'
  }

  return path
}

function calculateStringSimilarity (str1, str2) {
  if (str1 === str2) return 1.0
  if (!str1 || !str2) return 0.0

  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1

  if (longer.length === 0) return 1.0

  const editDistance = levenshteinDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

function levenshteinDistance (str1, str2) {
  const matrix = []

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }

  return matrix[str2.length][str1.length]
}

function findClosestMatches (request, mockDispatches, origin) {
  const suggestions = []

  for (const dispatch of mockDispatches) {
    if (dispatch.consumed) continue

    const pathSimilarity = calculateStringSimilarity(request.path, dispatch.path)
    const methodMatch = request.method === dispatch.method
    const hasBodyConstraint = typeof dispatch.body !== 'undefined'
    const bodyMatch = !hasBodyConstraint || matchValue(dispatch.body, request.body)
    const headersMatch = matchHeaders(dispatch, request.headers)

    let reason = ''
    if (!methodMatch) reason = 'method mismatch'
    else if (pathSimilarity < 1.0) reason = 'path mismatch'
    else if (!bodyMatch) reason = 'body mismatch'
    else if (!headersMatch) reason = 'headers mismatch'

    if (pathSimilarity > 0.5 || methodMatch || (!methodMatch && pathSimilarity > 0.8)) {
      suggestions.push({
        dispatch,
        pathSimilarity,
        methodMatch,
        bodyMatch,
        headersMatch,
        reason,
        score: (pathSimilarity + (methodMatch ? 1 : 0) + (bodyMatch ? 1 : 0) + (headersMatch ? 1 : 0)) / 4
      })
    }
  }

  return suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

function buildEnhancedErrorMessage (type, request, mockDispatches, origin, resolvedPath) {
  const availableInterceptors = mockDispatches
    .filter(({ consumed }) => !consumed)
    .map(dispatch => ({
      ...dispatch,
      origin,
      timesInvoked: dispatch.timesInvoked || 0,
      times: dispatch.times || 1,
      pending: dispatch.pending !== false
    }))

  let message = `Mock dispatch not matched for ${type} '${type === 'path' ? resolvedPath : request[type]}'`

  if (availableInterceptors.length > 0) {
    message += '\n\nAvailable interceptors for origin \'' + origin + '\':\n'
    const formatter = new PendingInterceptorsFormatter({ disableColors: true })
    message += formatter.format(availableInterceptors)

    message += '\nRequest details:'
    message += `\n- Method: ${request.method}`
    message += `\n- Path: ${resolvedPath}`
    if (request.headers) {
      const headersStr = typeof request.headers === 'object' ? JSON.stringify(request.headers) : request.headers
      message += `\n- Headers: ${headersStr}`
    }
    message += `\n- Body: ${request.body || 'undefined'}`

    const suggestions = findClosestMatches(request, mockDispatches, origin)
    if (suggestions.length > 0) {
      message += '\n\nPotential matches:'
      for (const suggestion of suggestions) {
        const { dispatch, reason, pathSimilarity } = suggestion
        const similarity = pathSimilarity < 1.0 ? `, similarity: ${pathSimilarity.toFixed(1)}` : ''
        message += `\n- ${dispatch.method} ${dispatch.path} (${reason}${similarity})`
      }
    }
  }

  return message
}

function buildKey (opts) {
  const { path, method, body, headers, query } = opts

  return {
    path,
    method,
    body,
    headers,
    query
  }
}

function generateKeyValues (data) {
  const keys = Object.keys(data)
  const result = []
  for (let i = 0; i < keys.length; ++i) {
    const key = keys[i]
    const value = data[key]
    const name = Buffer.from(`${key}`)
    if (Array.isArray(value)) {
      for (let j = 0; j < value.length; ++j) {
        result.push(name, Buffer.from(`${value[j]}`))
      }
    } else {
      result.push(name, Buffer.from(`${value}`))
    }
  }
  return result
}

/**
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
 * @param {number} statusCode
 */
function getStatusText (statusCode) {
  return STATUS_CODES[statusCode] || 'unknown'
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
  const mockDispatch = getMockDispatch(this[kDispatches], key, this[kOrigin])

  // Trace successful match
  const agent = this[kMockAgent]
  if (agent && agent[kOptions]?.traceRequests) {
    traceRequest(agent, opts, this[kOrigin], mockDispatch)
  }

  mockDispatch.timesInvoked++

  // Here's where we resolve a callback if a callback is present for the dispatch data.
  if (mockDispatch.data.callback) {
    mockDispatch.data = { ...mockDispatch.data, ...mockDispatch.data.callback(opts) }
  }

  // Parse mockDispatch data
  const { data: { statusCode, data, headers, trailers, error }, delay, persist } = mockDispatch
  const { timesInvoked, times } = mockDispatch

  // If it's used up and not persistent, mark as consumed
  mockDispatch.consumed = !persist && timesInvoked >= times
  mockDispatch.pending = timesInvoked < times

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

  function handleReply (mockDispatches, _data = data) {
    // fetch's HeadersList is a 1D string array
    const optsHeaders = Array.isArray(opts.headers)
      ? buildHeadersFromArray(opts.headers)
      : opts.headers
    const body = typeof _data === 'function'
      ? _data({ ...opts, headers: optsHeaders })
      : _data

    // util.types.isPromise is likely needed for jest.
    if (isPromise(body)) {
      // If handleReply is asynchronous, throwing an error
      // in the callback will reject the promise, rather than
      // synchronously throw the error, which breaks some tests.
      // Rather, we wait for the callback to resolve if it is a
      // promise, and then re-run handleReply with the new body.
      body.then((newData) => handleReply(mockDispatches, newData))
      return
    }

    const responseData = getResponseData(body)
    const responseHeaders = generateKeyValues(headers)
    const responseTrailers = generateKeyValues(trailers)

    handler.onConnect?.(err => handler.onError(err), null)
    handler.onHeaders?.(statusCode, responseHeaders, resume, getStatusText(statusCode))
    handler.onData?.(Buffer.from(responseData))
    handler.onComplete?.(responseTrailers)
    deleteMockDispatch(mockDispatches, key)
  }

  function resume () {}

  return true
}

function traceRequest (agent, opts, origin, matched = null, error = null) {
  const traceRequests = agent[kOptions]?.traceRequests
  if (!traceRequests) return

  const method = opts.method || 'GET'
  const url = `${origin}${opts.path || '/'}`

  if (traceRequests === 'verbose') {
    console.error('[MOCK] 🔍 Request received:')
    console.error(`  Method: ${method}`)
    console.error(`  URL: ${url}`)
    if (opts.headers) {
      const headersStr = typeof opts.headers === 'object' ? JSON.stringify(opts.headers) : opts.headers
      console.error(`  Headers: ${headersStr}`)
    }
    console.error(`  Body: ${opts.body || 'undefined'}`)
    console.error('')

    if (matched) {
      console.error('[MOCK] 🔎 Checking interceptors for origin \'' + origin + '\':')
      console.error(`  1. Testing ${matched.method} ${matched.path}... ✅ MATCH!`)
      console.error(`     - Method: ✅ ${method} === ${matched.method}`)
      console.error(`     - Path: ✅ ${opts.path} === ${matched.path}`)
      console.error('     - Headers: ✅ (no header constraints)')
      console.error('     - Body: ✅ (no body constraints)')
      console.error('')
      console.error('[MOCK] ✅ Responding with:')
      console.error(`  Status: ${matched.data.statusCode}`)
      if (matched.data.headers) {
        console.error(`  Headers: ${JSON.stringify(matched.data.headers)}`)
      }
    } else if (error) {
      console.error('[MOCK] ❌ NO MATCH found')
    }
  } else {
    if (matched) {
      console.error(`[MOCK] Incoming request: ${method} ${url}`)
      console.error(`[MOCK] ✅ MATCHED interceptor: ${matched.method} ${matched.path} -> ${matched.data.statusCode}`)
    } else if (error) {
      console.error(`[MOCK] Incoming request: ${method} ${url}`)
      console.error(`[MOCK] ❌ NO MATCH found for: ${method} ${opts.path}`)
    }
  }
}

function buildMockDispatch () {
  const agent = this[kMockAgent]
  const origin = this[kOrigin]
  const originalDispatch = this[kOriginalDispatch]

  return function dispatch (opts, handler) {
    if (agent.isMockActive) {
      try {
        traceRequest(agent, opts, origin)
        mockDispatch.call(this, opts, handler)
      } catch (error) {
        if (error instanceof MockNotMatchedError) {
          traceRequest(agent, opts, origin, null, error)

          const netConnect = agent[kGetNetConnect]()
          if (netConnect === false) {
            throw new MockNotMatchedError(`${error.message}: subsequent request to origin ${origin} was not allowed (net.connect disabled)`)
          }
          if (checkNetConnect(netConnect, origin)) {
            originalDispatch.call(this, opts, handler)
          } else {
            throw new MockNotMatchedError(`${error.message}: subsequent request to origin ${origin} was not allowed (net.connect is not enabled for this origin)`)
          }
        } else {
          throw error
        }
      }
    } else {
      originalDispatch.call(this, opts, handler)
    }
  }
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

function buildAndValidateMockOptions (opts) {
  if (opts) {
    const { agent, ...mockOptions } = opts

    if ('enableCallHistory' in mockOptions && typeof mockOptions.enableCallHistory !== 'boolean') {
      throw new InvalidArgumentError('options.enableCallHistory must to be a boolean')
    }

    if ('acceptNonStandardSearchParameters' in mockOptions && typeof mockOptions.acceptNonStandardSearchParameters !== 'boolean') {
      throw new InvalidArgumentError('options.acceptNonStandardSearchParameters must to be a boolean')
    }

    if ('traceRequests' in mockOptions && typeof mockOptions.traceRequests !== 'boolean' && mockOptions.traceRequests !== 'verbose') {
      throw new InvalidArgumentError('options.traceRequests must be a boolean or "verbose"')
    }

    if ('developmentMode' in mockOptions && typeof mockOptions.developmentMode !== 'boolean') {
      throw new InvalidArgumentError('options.developmentMode must be a boolean')
    }

    if ('verboseErrors' in mockOptions && typeof mockOptions.verboseErrors !== 'boolean') {
      throw new InvalidArgumentError('options.verboseErrors must be a boolean')
    }

    return mockOptions
  }
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
  getStatusText,
  mockDispatch,
  buildMockDispatch,
  checkNetConnect,
  buildAndValidateMockOptions,
  getHeaderByName,
  buildHeadersFromArray,
  normalizeSearchParams
}
