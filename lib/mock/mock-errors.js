'use strict'

const { UndiciError } = require('../core/errors')

/**
 * The request does not match any registered mock dispatches.
 */
class MockNotMatchedError extends UndiciError {
  name = /** @type {const} */ ('MockNotMatchedError')
  code = /** @type {const} */ ('UND_MOCK_ERR_MOCK_NOT_MATCHED')

  constructor (message) {
    super(message)
    this.message = message || 'The request does not match any registered mock dispatches'
  }
}

module.exports = {
  MockNotMatchedError
}
