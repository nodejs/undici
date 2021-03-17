'use strict'

const { promisify } = require('util')
const Pool = require('../pool')
const { mockDispatch } = require('./mock-utils')
const {
  kDispatch,
  kDispatches,
  kMockAgent,
  kClose,
  kOriginalClose,
  kOrigin
} = require('./mock-symbols')
const MockInterceptor = require('./mock-interceptor')
const { kAgentCache } = require('../core/symbols')
const { InvalidArgumentError } = require('../core/errors')

/**
 * MockPool provides an API that extends the Pool to influence the mockDispatches.
 */
class MockPool extends Pool {
  constructor (origin, opts) {
    super(origin, opts)

    if (!opts || !opts.agent || typeof opts.agent.get !== 'function') {
      throw new InvalidArgumentError('Argument opts.agent must implement Agent')
    }

    this[kMockAgent] = opts.agent
    this[kOrigin] = origin
    this[kDispatches] = []

    this[kOriginalClose] = this.close.bind(this)
    this.close = this[kClose]
  }

  /**
   * Sets up the base interceptor for mocking replies from undici.
   */
  intercept (opts) {
    return new MockInterceptor(opts, this[kDispatches])
  }

  [kDispatch] (opts, handler) {
    return mockDispatch.call(this, opts, handler)
  }

  async [kClose] () {
    await promisify(this[kOriginalClose])()
    this[kMockAgent][kAgentCache].delete(this[kOrigin])
  }
}

module.exports = MockPool
