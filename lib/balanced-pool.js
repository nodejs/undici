'use strict'

const {
  BalancedPoolMissingUpstreamError,
} = require('./core/errors')
const {
  PoolBase,
  kClients,
  kNeedDrain,
  kAddClient,
  kRemoveClient,
  kDispatch,
 } = require('./pool-base')
const Pool = require('./pool')

const kOptions = Symbol('options')
const kUpstream = Symbol('upstream')

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
      pool[kUpstream] === upstream &&
      pool.closed !== true &&
      pool.destroyed !== true
    ))) {
      return this
    }

    const pool = new Pool(upstream, Object.assign({}, this[kOptions]))

    pool[kUpstream] = upstream

    this[kAddClient](pool)

    return this
  }

  removeUpstream (upstream) {
    const pool = this[kClients].find((pool) => (
      pool[kUpstream] === upstream &&
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
      .map((p) => p[kUpstream])
  }

  [kDispatch] () {
    // We validate that pools is greater than 0,
    // otherwise we would have to wait until an upstream
    // is added, which might never happen.
    if (this[kClients].length === 0) {
      throw new BalancedPoolMissingUpstreamError()
    }

    let dispatcher = this[kClients].find(dispatcher => (
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
