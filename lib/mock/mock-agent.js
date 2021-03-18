'use strict'

const { kAgentOpts, kAgentCache } = require('../core/symbols')
const { Agent } = require('../agent')
const {
  kAgent,
  kMockAgentSet,
  kMockAgentGet,
  kDispatches,
  kCreatePool,
  kIsMockActive,
  kNetConnect,
  kGetNetConnect
} = require('./mock-symbols')
const MockClient = require('./mock-client')
const MockPool = require('./mock-pool')
const { matchValue } = require('./mock-utils')
const { InvalidArgumentError } = require('../core/errors')

class MockAgent {
  constructor (opts) {
    this[kNetConnect] = true
    this[kIsMockActive] = true

    // Instantiate Agent and encapsulate
    const agent = new Agent(opts)
    this[kAgent] = agent
    this[kAgentCache] = agent[kAgentCache]
    this[kAgentOpts] = agent[kAgentOpts]
  }

  get (origin) {
    let pool = this[kMockAgentGet](origin)
    if (!pool) {
      pool = this[kCreatePool](origin)
      this[kMockAgentSet](origin, pool)
    }
    return pool
  }

  async close () {
    await this[kAgent].close()
  }

  deactivate () {
    this[kIsMockActive] = false
  }

  activate () {
    this[kIsMockActive] = true
  }

  enableNetConnect (matcher) {
    if (typeof matcher === 'string' || typeof matcher === 'function' || matcher instanceof RegExp) {
      if (Array.isArray(this[kNetConnect])) {
        this[kNetConnect].push(matcher)
      } else {
        this[kNetConnect] = [matcher]
      }
    } else if (typeof matcher === 'undefined') {
      this[kNetConnect] = true
    } else {
      throw new InvalidArgumentError('Unsupported matcher. Must be one of String|Function|RegExp.')
    }
  }

  disableNetConnect () {
    this[kNetConnect] = false
  }

  [kMockAgentSet] (origin, pool) {
    this[kAgentCache].set(origin, pool)
  }

  [kCreatePool] (origin) {
    const mockOptions = Object.assign({ agent: this }, this[kAgentOpts])
    return this[kAgentOpts] && this[kAgentOpts].connections === 1
      ? new MockClient(origin, mockOptions)
      : new MockPool(origin, mockOptions)
  }

  [kMockAgentGet] (origin) {
    // First check if we can immediately find it
    let pool = this[kAgentCache].get(origin)
    if (pool) {
      return pool
    }

    // If the origin is not a string create a dummy parent pool and return to user
    if (typeof origin !== 'string') {
      pool = this[kCreatePool]('http://localhost:9999')
      this[kMockAgentSet](origin, pool)
      return pool
    }

    // If we match, create a pool and assign the same dispatches
    for (const [keyMatcher, nonExplicitPool] of Array.from(this[kAgentCache])) {
      if (typeof keyMatcher !== 'string' && matchValue(keyMatcher, origin)) {
        pool = this[kCreatePool](origin)
        this[kMockAgentSet](origin, pool)
        pool[kDispatches] = nonExplicitPool[kDispatches]
        return pool
      }
    }
  }

  [kGetNetConnect] () {
    return this[kNetConnect]
  }
}

module.exports = MockAgent
