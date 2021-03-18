'use strict'

const { promisify } = require('util')
const Client = require('../core/client')
const { buildMockDispatch } = require('./mock-utils')
const {
  kDispatches,
  kMockAgent,
  kClose,
  kOriginalClose,
  kOrigin,
  kOriginalDispatch
} = require('./mock-symbols')
const MockInterceptor = require('./mock-interceptor')
const { kAgentCache } = require('../core/symbols')
const { InvalidArgumentError } = require('../core/errors')

/**
 * MockClient provides an API that extends the Client to influence the mockDispatches.
 */
class MockClient extends Client {
  constructor (origin, opts) {
    super(origin, opts)

    if (!opts || !opts.agent || typeof opts.agent.get !== 'function') {
      throw new InvalidArgumentError('Argument opts.agent must implement Agent')
    }

    this[kMockAgent] = opts.agent
    this[kOrigin] = origin
    this[kDispatches] = []
    this[kOriginalDispatch] = this.dispatch
    this[kOriginalClose] = this.close.bind(this)

    this.dispatch = buildMockDispatch.call(this)
    this.close = this[kClose]
  }

  /**
   * Sets up the base interceptor for mocking replies from undici.
   */
  intercept (opts) {
    return new MockInterceptor(opts, this[kDispatches])
  }

  async [kClose] () {
    await promisify(this[kOriginalClose])()
    this[kMockAgent][kAgentCache].delete(this[kOrigin])
  }
}

module.exports = MockClient
