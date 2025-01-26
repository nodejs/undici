'use strict'

const {
  kMockCallHistoryAddLog,
  kMockCallHistoryGetByName,
  kMockCallHistoryClearAll,
  kMockCallHistoryDeleteAll
} = require('./mock-symbols')

const computingError = 'error occurred when computing MockCallHistoryLog.url'

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
    } else {
      this.path = computingError
      this.searchParams = computingError
      this.protocol = computingError
      this.host = computingError
      this.port = computingError
    }
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
    return this.logs.at(number)
  }

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
