'use strict'

const { UndiciError } = require('../core/errors')

class MockNotMatchedError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, MockNotMatchedError)
    this.name = 'MockNotMatchedError'
    this.message = message
    this.code = 'UND_MOCK_ERR_MOCK_NOT_MATCHED'
  }
}

module.exports = {
  MockNotMatchedError
}
