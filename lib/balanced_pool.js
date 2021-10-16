'use strict'

const { BalancedPoolMissingUpstreamError } = require('./core/errors')
const Dispatcher = require('./dispatcher')
const Pool = require('./pool')

const kPools = Symbol('kPools')
const kPoolOpts = Symbol('kPoolOpts')

class BalancedPool extends Dispatcher {

  constructor (upstreams = [], opts = {}) {
    super()

    this[kPools] = []
    this[kPoolOpts] = opts

    if (!Array.isArray(upstreams)) {
      upstreams = [upstreams]
    }

    upstreams.forEach(this.addUpstream.bind(this))
  }

  addUpstream (upstream) {
    if (this[kPools].find((pool) => pool.upstream === upstream)) {
      return this
    }

    const pool = new Pool(upstream, Object.assign({}, this[kPoolOpts]))

    pool.upstream = upstream

    pool.on('connect', (...args) => {
      this.emit('connect', ...args)
    })

    pool.on('disconnect', (...args) => {
      this.emit('disconnect', ...args)
    })

    pool.on('drain', (...args) => {
      this.emit('drain', ...args)
    })

    // TODO support Pool opts
    this[kPools].push(pool)
    return this
  }

  dispatch (opts, handler) {
    if (this[kPools].length == 0) {
      throw new BalancedPoolMissingUpstreamError()
    }
    // TODO validate that pools is greater than 1.

    // Get the first pool and rotate the pools
    // This is not the most efficient algorithm,
    // improving this would be good for future
    // optimizations.
    const pool = this[kPools].shift()
    this[kPools].push(pool)

    return pool.dispatch(opts, handler)
  }

  removeUpstream (upstream) {
    const pool = this[kPools].find((pool) => pool.upstream === upstream)
    const idx = this[kPools].indexOf(pool)
    this[kPools].splice(idx, 1)
    pool.close()
    return this
  }

  get upstreams () {
    return this[kPools].map((p) => p.upstream)
  }

  get destroyed () {
    return this[kPools].reduce((acc, pool) => acc && pool.destroyed, true)
  }

  get busy () {
    return this[kPools].reduce((acc, pool) => acc && pool.busy, true) || false
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
