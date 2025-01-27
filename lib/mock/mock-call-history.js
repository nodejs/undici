'use strict'

const {
  kMockCallHistoryAddLog,
  kMockCallHistoryGetByName,
  kMockCallHistoryClearAll,
  kMockCallHistoryDeleteAll
} = require('./mock-symbols')
const { InvalidArgumentError } = require('../core/errors')

const computingError = 'error occurred when computing MockCallHistoryLog.url'

function makeFilterCalls (parameterName) {
  return (parameterValue) => {
    if (typeof parameterValue !== 'string' && !(parameterValue instanceof RegExp) && parameterValue != null) {
      throw new InvalidArgumentError(`${parameterName} parameter should be one of string, regexp, undefined or null`)
    }
    if (typeof parameterValue === 'string' || parameterValue == null) {
      return this.logs.filter((log) => {
        return log[parameterName] === parameterValue
      })
    }
    if (parameterValue instanceof RegExp) {
      return this.logs.filter((log) => {
        return parameterValue.test(log[parameterName])
      })
    }

    return []
  }
}
function computeUrlWithMaybeSearchParameters (requestInit) {
  // path can contains query url parameters
  // or query can contains query url parameters
  try {
    const url = new URL(requestInit.path, requestInit.origin)

    // requestInit.path contains query url parameters
    // requestInit.query is then undefined
    if (url.search.length !== 0) {
      return url
    }

    // requestInit.query can be populated here
    url.search = new URLSearchParams(requestInit.query).toString()

    return url
  } catch {
    // should never happens
    return computingError
  }
}

class MockCallHistoryLog {
  constructor (requestInit = {}) {
    this.body = requestInit.body
    this.headers = requestInit.headers
    this.method = requestInit.method
    this.origin = requestInit.origin

    const url = computeUrlWithMaybeSearchParameters(requestInit)

    this.fullUrl = url.toString()

    if (url instanceof URL) {
      this.path = url.pathname
      this.searchParams = Object.fromEntries(url.searchParams)
      this.protocol = url.protocol
      this.host = url.host
      this.port = url.port
      this.hash = url.hash
    } else {
      // guard if new URL or new URLSearchParams failed. Should never happens, request initialization will fail before
      this.path = computingError
      this.searchParams = computingError
      this.protocol = computingError
      this.host = computingError
      this.port = computingError
      this.hash = computingError
    }
  }

  toMap () {
    return new Map([
      ['protocol', this.protocol],
      ['host', this.host],
      ['port', this.port],
      ['origin', this.origin],
      ['path', this.path],
      ['hash', this.hash],
      ['searchParams', this.searchParams],
      ['fullUrl', this.fullUrl],
      ['method', this.method],
      ['body', this.body],
      ['headers', this.headers]]
    )
  }

  toString () {
    let result = ''

    this.toMap().forEach((value, key) => {
      if (typeof value === 'string' || value === undefined || value === null) {
        result = `${result}${key}->${value}|`
      }
      if ((typeof value === 'object' && value !== null) || Array.isArray(value)) {
        result = `${result}${key}->${JSON.stringify(value)}|`
      }
      // maybe miss something for non Record / Array headers and searchParams here
    })

    // delete last suffix
    return result.slice(0, -1)
  }
}

class MockCallHistory {
  static AllMockCallHistory = new Map()

  logs = []

  constructor (name) {
    this.name = name

    MockCallHistory.AllMockCallHistory.set(this.name, this)
  }

  static [kMockCallHistoryGetByName] (name) {
    return MockCallHistory.AllMockCallHistory.get(name)
  }

  static [kMockCallHistoryClearAll] () {
    for (const callHistory of MockCallHistory.AllMockCallHistory.values()) {
      callHistory.clear()
    }
  }

  static [kMockCallHistoryDeleteAll] () {
    MockCallHistory.AllMockCallHistory.clear()
  }

  calls () {
    return this.logs
  }

  firstCall () {
    return this.logs.at(0)
  }

  lastCall () {
    return this.logs.at(-1)
  }

  nthCall (number) {
    if (typeof number !== 'number') {
      throw new InvalidArgumentError('nthCall must be called with a number')
    }
    if (!Number.isInteger(number)) {
      throw new InvalidArgumentError('nthCall must be called with an integer')
    }
    if (Math.sign(number) !== 1) {
      throw new InvalidArgumentError('nthCall must be called with a positive value. use firstCall or lastCall instead')
    }

    // non zero based index. this is more human readable
    return this.logs.at(number - 1)
  }

  filterCalls (criteria) {
    // perf
    if (this.logs.length === 0) {
      return this.logs
    }
    if (typeof criteria === 'function') {
      return this.logs.filter((log) => {
        return criteria(log)
      })
    }
    if (criteria instanceof RegExp) {
      return this.logs.filter((log) => {
        return criteria.test(log.toString())
      })
    }
    if (typeof criteria === 'object' && criteria !== null) {
      // no criteria - returning all logs
      if (Object.keys(criteria).length === 0) {
        return this.logs
      }

      const maybeDuplicatedLogsFiltered = []
      if ('protocol' in criteria) {
        maybeDuplicatedLogsFiltered.push(...this.filterCallsByProtocol(criteria.protocol))
      }
      if ('host' in criteria) {
        maybeDuplicatedLogsFiltered.push(...this.filterCallsByHost(criteria.host))
      }
      if ('port' in criteria) {
        maybeDuplicatedLogsFiltered.push(...this.filterCallsByPort(criteria.port))
      }
      if ('origin' in criteria) {
        maybeDuplicatedLogsFiltered.push(...this.filterCallsByOrigin(criteria.origin))
      }
      if ('path' in criteria) {
        maybeDuplicatedLogsFiltered.push(...this.filterCallsByPath(criteria.path))
      }
      if ('hash' in criteria) {
        maybeDuplicatedLogsFiltered.push(...this.filterCallsByHash(criteria.hash))
      }
      if ('fullUrl' in criteria) {
        maybeDuplicatedLogsFiltered.push(...this.filterCallsByFullUrl(criteria.fullUrl))
      }
      if ('method' in criteria) {
        maybeDuplicatedLogsFiltered.push(...this.filterCallsByMethod(criteria.method))
      }

      const uniqLogsFiltered = [...new Set(maybeDuplicatedLogsFiltered)]

      return uniqLogsFiltered
    }

    throw new InvalidArgumentError('criteria parameter should be one of string, function, regexp, or object')
  }

  filterCallsByProtocol = makeFilterCalls.call(this, 'protocol')

  filterCallsByHost = makeFilterCalls.call(this, 'host')

  filterCallsByPort = makeFilterCalls.call(this, 'port')

  filterCallsByOrigin = makeFilterCalls.call(this, 'origin')

  filterCallsByPath = makeFilterCalls.call(this, 'path')

  filterCallsByHash = makeFilterCalls.call(this, 'hash')

  filterCallsByFullUrl = makeFilterCalls.call(this, 'fullUrl')

  filterCallsByMethod = makeFilterCalls.call(this, 'method')

  clear () {
    this.logs = []
  }

  [kMockCallHistoryAddLog] (requestInit) {
    const log = new MockCallHistoryLog(requestInit)

    this.logs.push(log)

    return log
  }
}

module.exports.MockCallHistory = MockCallHistory
module.exports.MockCallHistoryLog = MockCallHistoryLog
