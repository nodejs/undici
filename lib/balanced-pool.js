'use strict'

const {
  BalancedPoolMissingUpstreamError
} = require('./core/errors')
const {
  PoolBase,
  kClients,
  kNeedDrain,
  kAddClient,
  kRemoveClient,
  kGetDispatcher
} = require('./pool-base')
const Pool = require('./pool')
const { kUrl } = require('./core/symbols')

const kOptions = Symbol('options')

class BalancedPool extends PoolBase {
  constructor (upstreams = [], opts = {}) {
    super()

    this[kOptions] = opts

    if (!Array.isArray(upstreams)) {
      upstreams = [upstreams]
    }

    for (const upstream of upstreams) {
      this.addUpstream(upstream)
    }
  }

  addUpstream (upstream) {
    if (this[kClients].find((pool) => (
      pool[kUrl].origin === upstream &&
      pool.closed !== true &&
      pool.destroyed !== true
    ))) {
      return this
    }

    this[kAddClient](new Pool(upstream, Object.assign({}, this[kOptions])))

    return this
  }

  removeUpstream (upstream) {
    const pool = this[kClients].find((pool) => (
      pool[kUrl].origin === upstream &&
      pool.closed !== true &&
      pool.destroyed !== true
    ))

    if (pool) {
      this[kRemoveClient](pool)
    }

    return this
  }

  get upstreams () {
    return this[kClients]
      .filter(dispatcher => dispatcher.closed !== true && dispatcher.destroyed !== true)
      .map((p) => p[kUrl].origin)
  }

  [kGetDispatcher] () {
    // We validate that pools is greater than 0,
    // otherwise we would have to wait until an upstream
    // is added, which might never happen.
    if (this[kClients].length === 0) {
      throw new BalancedPoolMissingUpstreamError()
    }

    const dispatcher = this[kClients].find(dispatcher => (
      !dispatcher[kNeedDrain] &&
      dispatcher.closed !== true &&
      dispatcher.destroyed !== true
    ))

    if (!dispatcher) {
      return
    }

    this[kClients].splice(this[kClients].indexOf(dispatcher), 1)
    this[kClients].push(dispatcher)

    return dispatcher
  }
}

module.exports = BalancedPool
