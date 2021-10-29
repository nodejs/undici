'use strict'

const { BalancedPoolMissingUpstreamError } = require('./core/errors')
const Dispatcher = require('./dispatcher')
const Pool = require('./pool')

const kPools = Symbol('kPools')
const kPoolOpts = Symbol('kPoolOpts')
const kUpstream = Symbol('kUpstream')
const kNeedDrain = Symbol('kNeedDrain')

class BalancedPool extends Dispatcher {
  constructor (upstreams = [], opts = {}) {
    super()

    this[kPools] = []
    this[kPoolOpts] = opts
    this[kNeedDrain] = false

    if (!Array.isArray(upstreams)) {
      upstreams = [upstreams]
    }

    for (const upstream of upstreams) {
      this.addUpstream(upstream)
    }
  }

  addUpstream (upstream) {
    if (this[kPools].find((pool) => pool[kUpstream] === upstream)) {
      return this
    }

    const pool = new Pool(upstream, Object.assign({}, this[kPoolOpts]))

    pool[kUpstream] = upstream

    pool.on('connect', (...args) => {
      this.emit('connect', ...args)
    })

    pool.on('disconnect', (...args) => {
      this.emit('disconnect', ...args)
    })

    pool.on('drain', (...args) => {
      pool[kNeedDrain] = false

      if (this[kNeedDrain]) {
        this[kNeedDrain] = false
        this.emit('drain', ...args)
      }
    })

    this[kPools].push(pool)
    return this
  }

  dispatch (opts, handler) {
    // We validate that pools is greater than 0,
    // otherwise we would have to wait until an upstream
    // is added, which might never happen.
    if (this[kPools].length === 0) {
      throw new BalancedPoolMissingUpstreamError()
    }

    const pool = this[kPools].find(pool => !pool[kNeedDrain]) || this[kPools][0]

    if (!pool.dispatch(opts, handler)) {
      pool[kNeedDrain] = true
      this[kNeedDrain] = true
    }

    this[kPools].splice(this[kPools].indexOf(pool), 1)
    this[kPools].push(pool)

    return !this[kNeedDrain]
  }

  removeUpstream (upstream) {
    const pool = this[kPools].find((pool) => pool[kUpstream] === upstream)
    const idx = this[kPools].indexOf(pool)
    this[kPools].splice(idx, 1)
    pool.close()
    return this
  }

  get upstreams () {
    return this[kPools].map((p) => p[kUpstream])
  }

  get destroyed () {
    return this[kPools].reduce((acc, pool) => acc && pool.destroyed, true)
  }

  get closed () {
    return this[kPools].reduce((acc, pool) => acc && pool.closed, true)
  }

  close (cb) {
    const p = Promise.all(this[kPools].map((p) => p.close()))

    if (!cb) {
      return p
    }

    p.then(() => process.nextTick(cb), (err) => process.nextTick(cb, err))
  }

  destroy (err, cb) {
    const p = Promise.all(this[kPools].map((p) => p.destroy(err)))

    if (!cb) {
      return p
    }

    p.then(() => process.nextTick(cb))
  }
}

module.exports = BalancedPool
