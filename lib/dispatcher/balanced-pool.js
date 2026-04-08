'use strict'

const dns = require('node:dns')
const { isIP } = require('node:net')
const {
  BalancedPoolMissingUpstreamError,
  InvalidArgumentError
} = require('../core/errors')
const {
  PoolBase,
  kClients,
  kNeedDrain,
  kAddClient,
  kRemoveClient,
  kGetDispatcher
} = require('./pool-base')
const Pool = require('./pool')
const buildConnector = require('../core/connect')
const { kUrl } = require('../core/symbols')
const util = require('../core/util')
const kFactory = Symbol('factory')

const kOptions = Symbol('options')
const kGreatestCommonDivisor = Symbol('kGreatestCommonDivisor')
const kCurrentWeight = Symbol('kCurrentWeight')
const kIndex = Symbol('kIndex')
const kWeight = Symbol('kWeight')
const kMaxWeightPerServer = Symbol('kMaxWeightPerServer')
const kErrorPenalty = Symbol('kErrorPenalty')

/**
 * Calculate the greatest common divisor of two numbers by
 * using the Euclidean algorithm.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function getGreatestCommonDivisor (a, b) {
  if (a === 0) return b

  while (b !== 0) {
    const t = b
    b = a % b
    a = t
  }
  return a
}

function defaultFactory (origin, opts) {
  return new Pool(origin, opts)
}

function buildDnsBalancedConnector (origin, opts) {
  const {
    connect,
    connectTimeout,
    tls,
    maxCachedSessions,
    socketPath,
    autoSelectFamily,
    autoSelectFamilyAttemptTimeout,
    allowH2
  } = opts

  const connector = typeof connect === 'function'
    ? connect
    : buildConnector({
      ...tls,
      maxCachedSessions,
      allowH2,
      socketPath,
      timeout: connectTimeout,
      ...(typeof autoSelectFamily === 'boolean' ? { autoSelectFamily, autoSelectFamilyAttemptTimeout } : undefined),
      ...connect
    })

  let offset = -1

  return function dnsBalancedConnector (connectOpts, callback) {
    dns.lookup(origin.hostname, { all: true, order: 'ipv4first' }, (err, addresses) => {
      if (err) {
        callback(err)
        return
      }

      const uniqueAddresses = []
      const seen = new Set()

      for (const address of addresses) {
        const key = `${address.address}:${address.family}`
        if (seen.has(key)) {
          continue
        }

        seen.add(key)
        uniqueAddresses.push(address)
      }

      if (uniqueAddresses.length === 0) {
        callback(new Error(`No DNS entries found for ${origin.hostname}`))
        return
      }

      offset = (offset + 1) % uniqueAddresses.length
      const address = uniqueAddresses[offset]

      connector({
        ...connectOpts,
        hostname: address.address,
        servername: connectOpts.servername ?? origin.hostname
      }, callback)
    })
  }
}

class BalancedPool extends PoolBase {
  constructor (upstreams = [], { factory = defaultFactory, ...opts } = {}) {
    if (typeof factory !== 'function') {
      throw new InvalidArgumentError('factory must be a function.')
    }

    super()

    this[kOptions] = { ...util.deepClone(opts) }
    this[kOptions].connect = opts.connect
    this[kOptions].interceptors = opts.interceptors
      ? { ...opts.interceptors }
      : undefined
    this[kIndex] = -1
    this[kCurrentWeight] = 0

    this[kMaxWeightPerServer] = this[kOptions].maxWeightPerServer || 100
    this[kErrorPenalty] = this[kOptions].errorPenalty || 15

    if (!Array.isArray(upstreams)) {
      upstreams = [upstreams]
    }

    this[kFactory] = factory

    for (const upstream of upstreams) {
      this.addUpstream(upstream)
    }
    this._updateBalancedPoolStats()
  }

  addUpstream (upstream) {
    const upstreamUrl = util.parseOrigin(upstream)
    const upstreamOrigin = upstreamUrl.origin

    if (this[kClients].find((pool) => (
      pool[kUrl].origin === upstreamOrigin &&
      pool.closed !== true &&
      pool.destroyed !== true
    ))) {
      return this
    }

    const poolOptions = isIP(upstreamUrl.hostname) === 0
      ? {
          ...this[kOptions],
          connect: buildDnsBalancedConnector(upstreamUrl, this[kOptions])
        }
      : this[kOptions]

    const pool = this[kFactory](upstreamOrigin, poolOptions)

    this[kAddClient](pool)
    pool.on('connect', () => {
      pool[kWeight] = Math.min(this[kMaxWeightPerServer], pool[kWeight] + this[kErrorPenalty])
    })

    pool.on('connectionError', () => {
      pool[kWeight] = Math.max(1, pool[kWeight] - this[kErrorPenalty])
      this._updateBalancedPoolStats()
    })

    pool.on('disconnect', (...args) => {
      const err = args[2]
      if (err && err.code === 'UND_ERR_SOCKET') {
        // decrease the weight of the pool.
        pool[kWeight] = Math.max(1, pool[kWeight] - this[kErrorPenalty])
        this._updateBalancedPoolStats()
      }
    })

    for (const client of this[kClients]) {
      client[kWeight] = this[kMaxWeightPerServer]
    }

    this._updateBalancedPoolStats()

    return this
  }

  _updateBalancedPoolStats () {
    let result = 0
    for (let i = 0; i < this[kClients].length; i++) {
      result = getGreatestCommonDivisor(this[kClients][i][kWeight], result)
    }

    this[kGreatestCommonDivisor] = result
  }

  removeUpstream (upstream) {
    const upstreamOrigin = util.parseOrigin(upstream).origin

    const pool = this[kClients].find((pool) => (
      pool[kUrl].origin === upstreamOrigin &&
      pool.closed !== true &&
      pool.destroyed !== true
    ))

    if (pool) {
      this[kRemoveClient](pool)
    }

    return this
  }

  getUpstream (upstream) {
    const upstreamOrigin = util.parseOrigin(upstream).origin

    return this[kClients].find((pool) => (
      pool[kUrl].origin === upstreamOrigin &&
      pool.closed !== true &&
      pool.destroyed !== true
    ))
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

    const allClientsBusy = this[kClients].map(pool => pool[kNeedDrain]).reduce((a, b) => a && b, true)

    if (allClientsBusy) {
      return
    }

    let counter = 0

    let maxWeightIndex = this[kClients].findIndex(pool => !pool[kNeedDrain])

    while (counter++ < this[kClients].length) {
      this[kIndex] = (this[kIndex] + 1) % this[kClients].length
      const pool = this[kClients][this[kIndex]]

      // find pool index with the largest weight
      if (pool[kWeight] > this[kClients][maxWeightIndex][kWeight] && !pool[kNeedDrain]) {
        maxWeightIndex = this[kIndex]
      }

      // decrease the current weight every `this[kClients].length`.
      if (this[kIndex] === 0) {
        // Set the current weight to the next lower weight.
        this[kCurrentWeight] = this[kCurrentWeight] - this[kGreatestCommonDivisor]

        if (this[kCurrentWeight] <= 0) {
          this[kCurrentWeight] = this[kMaxWeightPerServer]
        }
      }
      if (pool[kWeight] >= this[kCurrentWeight] && (!pool[kNeedDrain])) {
        return pool
      }
    }

    this[kCurrentWeight] = this[kClients][maxWeightIndex][kWeight]
    this[kIndex] = maxWeightIndex
    return this[kClients][maxWeightIndex]
  }
}

module.exports = BalancedPool
