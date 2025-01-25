class MockHistoryLog {
  constructor (requestInit = {}) {
    this.body = requestInit.body
    this.headers = requestInit.headers
    this.origin = requestInit.origin
    this.method = requestInit.method
    this.path = requestInit.path
    this.query = requestInit.query
  }

  get url () {
    const url = new URL(this.path, this.origin)

    if (url.search.length !== 0) {
      return url.toString()
    }

    url.search = new URLSearchParams(this.query).toString()

    return url.toString()
  }
}

class MockCallHistory {
  static AllMockCallHistory = new Map()

  logs = []

  constructor (name) {
    this.name = name

    MockCallHistory.AllMockCallHistory.set(this.name, this)
  }

  static GetByName (name) {
    return MockCallHistory.AllMockCallHistory.get(name)
  }

  static Delete (name) {
    MockCallHistory.AllMockCallHistory.delete(name)
  }

  static ClearAll () {
    for (const [
      ,
      callHistory
    ] of MockCallHistory.AllMockCallHistory.entries()) {
      callHistory.clear()
    }
  }

  calls () {
    return this.logs
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

  _add (requestInit) {
    const log = new MockHistoryLog(requestInit)

    this.logs.push(log)

    return log
  }
}

module.exports.MockCallHistory = MockCallHistory
module.exports.MockHistoryLog = MockHistoryLog
