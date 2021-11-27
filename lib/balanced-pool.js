'use strict'

const {
  BalancedPoolMissingUpstreamError,
  ClientClosedError,
  InvalidArgumentError,
  ClientDestroyedError
} = require('./core/errors')
const {
  PoolBase,
  kClients,
  kNeedDrain,
  kOnDrain,
  kOnConnect,
  kOnDisconnect,
  kDispatch,
  kOnConnectionError
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
      .on('drain', this[kOnDrain])
      .on('connect', this[kOnConnect])
      .on('disconnect', this[kOnDisconnect])
      .on('connectionError', this[kOnConnectionError])

    pool[kUpstream] = upstream

    this[kClients].push(pool)
    return this
  }

  removeUpstream (upstream) {
    const pool = this[kClients].find((pool) => (
      pool[kUpstream] === upstream &&
      pool.closed !== true &&
      pool.destroyed !== true
    ))
    if (pool) {
      pool.close(() => {
        const idx = this[kClients].indexOf(pool)
        if (idx !== -1) {
          this[kClients].splice(idx, 1)
        }
      })
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
