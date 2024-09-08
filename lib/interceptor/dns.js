'use strict'
const { isIP } = require('node:net')
const { lookup } = require('node:dns')
const DecoratorHandler = require('../handler/decorator-handler')
const { InvalidArgumentError, InformationalError } = require('../core/errors')
const maxInt = Math.pow(2, 31) - 1

class DNSInstance {
  #maxTTL = 0
  #records = new Map()
  dualStack = true
  affinity = null
  lookup = null
  pick = null
  lastIpFamily = null

  constructor (opts) {
    this.#maxTTL = opts.maxTTL
    this.dualStack = opts.dualStack
    this.affinity = opts.affinity
    this.lookup = opts.lookup ?? this.#defaultLookup
    this.pick = opts.pick ?? this.#defaultPick
  }

  runLookup (origin, opts, cb) {
    const ips = this.#records.get(origin.hostname)
    const newOpts = {
      affinity: this.affinity,
      dualStack: this.dualStack,
      lookup: this.lookup,
      pick: this.pick,
      ...opts.dns,
      maxTTL: this.#maxTTL
    }

    // If no IPs we lookup
    if (ips == null) {
      this.lookup(origin, newOpts, (err, addresses) => {
        if (err || addresses == null || addresses.length === 0) {
          cb(err ?? new InformationalError('No DNS entries found'))
          return
        }

        this.setRecords(origin, addresses)
        const records = this.#records.get(origin.hostname)

        const ip = this.pick(
          origin,
          records,
          // Only set affinity if dual stack is disabled
          // otherwise let it go through normal flow
          !newOpts.dualStack && newOpts.affinity
        )

        return cb(
          null,
          `${origin.protocol}//${
            ip.family === 6 ? `[${ip.address}]` : ip.address
          }${origin.port === '' ? '' : `:${origin.port}`}`
        )
      })
    } else {
      // If there's IPs we pick
      const records = this.#records.get(origin.hostname)
      const ip = this.pick(
        origin,
        records,
        // Only set affinity if dual stack is disabled
        // otherwise let it go through normal flow
        !newOpts.dualStack && newOpts.affinity
      )

      // If no IPs we lookup - deleting old records
      if (ip == null) {
        this.#records.delete(origin.hostname)
        this.runLookup(origin, opts, cb)
        return
      }

      cb(
        null,
        `${origin.protocol}//${
          ip.family === 6 ? `[${ip.address}]` : ip.address
        }${origin.port === '' ? '' : `:${origin.port}`}`
      )
    }
  }

  #defaultLookup (origin, opts, cb) {
    lookup(
      origin.hostname,
      { all: true, family: this.dualStack === false ? this.affinity : 0 },
      (err, addresses) => {
        if (err) {
          return cb(err)
        }

        const results = []

        for (const addr of addresses) {
          const record = {
            address: addr.address,
            ttl: addr.ttl ? addr.ttl * 1000 : this.#maxTTL,
            family: addr.family
          }

          results.push(record)
        }

        cb(null, results)
      }
    )
  }

  #defaultPick (origin, hostnameRecords, affinity) {
    const { records, offset = 0 } = hostnameRecords
    let newOffset = 0

    if (offset === maxInt) {
      newOffset = 0
    } else {
      newOffset = offset + 1
    }

    // We balance between the two IP families
    // If dual-stack disabled, we automatically pick the affinity
    const newIpFamily = (newOffset & 1) === 1 ? 4 : 6
    const family =
      this.dualStack === false
        ? records[this.affinity]
        : records[affinity] ?? records[newIpFamily]

    // If no IPs and we already tried both families, we return null
    if (
      family == null &&
      // eslint-disable-next-line eqeqeq
      (this.dualStack === false || this.lastIpFamily != newIpFamily)
    ) {
      return this.pick(
        origin,
        hostnameRecords,
        affinity ?? this.lastIpFamily === 4 ? 6 : 4
      )
    }

    // If no IPs and we have tried both families, we return null
    if (
      family.ips.length === 0 &&
      // eslint-disable-next-line eqeqeq
      (this.dualStack === false || this.lastIpFamily != newIpFamily)
    ) {
      return null
    }

    family.offset = family.offset ?? 0
    hostnameRecords.offset = newOffset

    if (family.offset === maxInt) {
      family.offset = 0
    } else {
      family.offset++
    }

    const position = family.offset % family.ips.length
    const ip = family.ips[position]

    if (ip == null) {
      return null
    }

    const timestamp = Date.now()
    // Record TTL is already in ms
    if (ip.timestamp != null && timestamp - ip.timestamp > ip.ttl) {
      // We delete expired records
      // It is possible that they have different TTL, so we manage them individually
      family.ips.splice(position, 1)
      return this.pick(origin, hostnameRecords, affinity)
    }

    ip.timestamp = timestamp

    this.lastIpFamily = newIpFamily
    return ip
  }

  setRecords (origin, addresses) {
    const records = { records: { 4: null, 6: null } }
    for (const record of addresses) {
      const familyRecords = records.records[record.family] ?? { ips: [] }

      familyRecords.ips.push(record)
      records.records[record.family] = familyRecords
    }

    this.#records.set(origin.hostname, records)
  }

  getHandler (meta, opts) {
    return new DNSDispatchHandler(this, meta, opts)
  }
}

class DNSDispatchHandler extends DecoratorHandler {
  #state = null
  #opts = null
  #dispatch = null
  #handler = null
  #origin = null

  constructor (state, { origin, handler, dispatch }, opts) {
    super(handler)
    this.#origin = origin
    this.#handler = handler
    this.#opts = { ...opts }
    this.#state = state
    this.#dispatch = dispatch
  }

  onError (err) {
    switch (err.code) {
      case 'ETIMEDOUT':
      case 'ECONNREFUSED': {
        if (this.#state.dualStack) {
          // We delete the record and retry
          this.#state.runLookup(this.#origin, this.#opts, (err, newOrigin) => {
            if (err) {
              return this.#handler.onError(err)
            }

            const dispatchOpts = {
              ...this.#opts,
              origin: newOrigin
            }

            this.#dispatch(dispatchOpts, this)
          })

          // if dual-stack disabled, we error out
          return
        }

        this.#handler.onError(err)
        return
      }
      // eslint-disable-next-line no-fallthrough
      case 'ENOTFOUND':
        this.#state.deleteRecord(this.#origin)
      // eslint-disable-next-line no-fallthrough
      default:
        this.#handler.onError(err)
        break
    }
  }
}

module.exports = interceptorOpts => {
  if (
    interceptorOpts?.maxTTL != null &&
    (typeof interceptorOpts?.maxTTL !== 'number' ||
      !Number.isFinite(interceptorOpts?.maxTTL) ||
      interceptorOpts?.maxTTL < 0)
  ) {
    throw new InvalidArgumentError('Invalid maxTTL. Must be a positive number')
  }

  if (
    interceptorOpts?.affinity != null &&
    interceptorOpts?.affinity !== 4 &&
    interceptorOpts?.affinity !== 6
  ) {
    throw new InvalidArgumentError('Invalid affinity. Must be either 4 or 6')
  }

  if (
    interceptorOpts?.dualStack != null &&
    typeof interceptorOpts?.dualStack !== 'boolean'
  ) {
    throw new InvalidArgumentError('Invalid dualStack. Must be a boolean')
  }

  if (
    interceptorOpts?.lookup != null &&
    typeof interceptorOpts?.lookup !== 'function'
  ) {
    throw new InvalidArgumentError('Invalid lookup. Must be a function')
  }

  if (
    interceptorOpts?.pick != null &&
    typeof interceptorOpts?.pick !== 'function'
  ) {
    throw new InvalidArgumentError('Invalid pick. Must be a function')
  }

  const opts = {
    maxTTL: interceptorOpts?.maxTTL ?? 10e3, // Expressed in ms
    lookup: interceptorOpts?.lookup ?? null,
    pick: interceptorOpts?.pick ?? null,
    dualStack: interceptorOpts?.dualStack ?? true,
    affinity: interceptorOpts?.affinity ?? 4
  }

  const instance = new DNSInstance(opts)

  return dispatch => {
    return function dnsInterceptor (origDispatchOpts, handler) {
      const origin =
        origDispatchOpts.origin.constructor === URL
          ? origDispatchOpts.origin
          : new URL(origDispatchOpts.origin)

      if (isIP(origin.hostname) !== 0) {
        return dispatch(origDispatchOpts, handler)
      }

      instance.runLookup(origin, origDispatchOpts, (err, newOrigin) => {
        if (err) {
          return handler.onError(err)
        }

        const dispatchOpts = {
          ...origDispatchOpts,
          origin: newOrigin
        }

        dispatch(
          dispatchOpts,
          instance.getHandler({ origin, dispatch, handler }, origDispatchOpts)
        )
      })

      return true
    }
  }
}
