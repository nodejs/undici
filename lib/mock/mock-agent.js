'use strict'

const { kAgentOpts, kAgentCache, kUrl } = require('../core/symbols')
const { Agent, setGlobalAgent } = require('../agent')
const Client = require('../core/client')
const Pool = require('../pool')
const {
  kMockAgentSet,
  kMockAgentGet,
  kDispatch,
  kBuildMockDispatch,
  kClose,
  kOriginalClientDispatch,
  kOriginalPoolDispatch,
  kOriginalClose,
  kIsClient,
  kDispatches,
  kCreatePool,
  kIsMockEnabled,
  kIsMockActive,
  kNetConnect,
  kGetNetConnect
} = require('./mock-symbols')
const MockClient = require('./mock-client')
const MockPool = require('./mock-pool')
const { matchValue, checkNetConnect } = require('./mock-utils')
const { InvalidArgumentError } = require('../core/errors')

class MockAgent extends Agent {
  constructor (opts) {
    super(opts)
    const mockAgent = this

    this[kOriginalClientDispatch] = Client.prototype.dispatch
    this[kOriginalPoolDispatch] = Pool.prototype.dispatch
    this[kNetConnect] = true
    this[kIsMockActive] = true
    this[kOriginalClose] = this.close
    this.close = this[kClose]

    if (this[kIsMockEnabled]()) {
      Client.prototype.dispatch = this[kBuildMockDispatch](this[kOriginalClientDispatch])
      Pool.prototype.dispatch = this[kBuildMockDispatch](this[kOriginalPoolDispatch])
    }

    setGlobalAgent(mockAgent)
  }

  get (origin) {
    let pool = this[kMockAgentGet](origin)
    if (!pool) {
      pool = this[kCreatePool](origin)
      this[kMockAgentSet](origin, pool)
    }

    const originalDispatch = this[kIsClient]() ? this[kOriginalClientDispatch] : this[kOriginalPoolDispatch]
    const isMockEnabled = this[kIsMockEnabled].bind(this)
    const getNetConnect = this[kGetNetConnect].bind(this)

    pool.dispatch = function dispatch (opts, handler) {
      if (isMockEnabled()) {
        let foundMockDispatch = false
        foundMockDispatch = pool[kDispatch](opts, handler)
        if (!foundMockDispatch) {
          const netConnect = getNetConnect()
          if (checkNetConnect(netConnect, origin)) {
            originalDispatch.call(this, opts, handler)
          } else {
            throw new Error(`Unable to find mock dispatch and real dispatches are disabled for ${origin}`)
          }
        }
      } else {
        originalDispatch.call(this, opts, handler)
      }
    }
    return pool
  }

  deactivate () {
    this[kIsMockActive] = false
    Client.prototype.dispatch = this[kOriginalClientDispatch]
    Pool.prototype.dispatch = this[kOriginalPoolDispatch]
  }

  activate () {
    this[kIsMockActive] = true
    Client.prototype.dispatch = this[kBuildMockDispatch](this[kOriginalClientDispatch])
    Pool.prototype.dispatch = this[kBuildMockDispatch](this[kOriginalPoolDispatch])
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

  [kIsMockEnabled] () {
    if (!this[kIsMockActive]) {
      return false
    }
    return process.env.UNDICI_MOCK_OFF !== 'true'
  }

  [kIsClient] () {
    return this[kAgentOpts] && this[kAgentOpts].connections === 1
  }

  [kMockAgentSet] (origin, pool) {
    this[kAgentCache].set(origin, pool)
  }

  [kCreatePool] (origin) {
    const mockOptions = Object.assign({ agent: this }, this[kAgentOpts])
    return this[kIsClient]()
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

  async [kClose] () {
    await this[kOriginalClose]()
    Client.prototype.dispatch = this[kOriginalClientDispatch]
    Pool.prototype.dispatch = this[kOriginalPoolDispatch]
  }

  [kBuildMockDispatch] (originalDispatch) {
    const agentScope = this
    const getNetConnect = this[kGetNetConnect].bind(this)
    return function mockDispatch (opts, handler) {
      const pool = agentScope[kMockAgentGet].bind(agentScope)(this[kUrl].origin)
      const mockNetConnect = getNetConnect()
      const foundMockDispatch = pool[kDispatch]({ ...opts, mockNetConnect }, handler)
      if (!foundMockDispatch) {
        const netConnect = getNetConnect()
        if (checkNetConnect(netConnect, this[kUrl].origin)) {
          originalDispatch.bind(this)(opts, handler)
        } else {
          throw new Error(`Unable to find mock dispatch and real dispatches are disabled for ${this[kUrl].origin}`)
        }
      }
    }
  }

  [kGetNetConnect] () {
    return this[kNetConnect]
  }
}

module.exports = MockAgent
