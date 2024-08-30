'use strict'
const { isIP } = require('node:net')
const { lookup } = require('node:dns')
const DecoratorHandler = require('../handler/decorator-handler')
const { InvalidArgumentError } = require('../core/errors')
const maxInt = Math.pow(2, 31) - 1

class DNSInstance {
  #maxTTL = 0 // TODO: support TTL
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
            ttl: opts.maxTTL,
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
    const family =
      this.dualStack === false
        ? records[this.affinity]
        : records[affinity] ??
          records[(this.lastIpFamily = (newOffset & 1) === 1 ? 4 : 6)]

    if (family == null) {
      return this.pick(
        origin,
        hostnameRecords,
        affinity ?? this.lastIpFamily === 4 ? 6 : 4
      )
    }

    family.offset = family.offset ?? 0
    hostnameRecords.offset = newOffset

    if (family.offset === maxInt) {
      family.offset = 0
    } else {
      family.offset++
    }

    const ip = family.ips[family.offset % family.ips.length]

    const timestamp = Date.now()
    if (ip.timestamp != null && timestamp - ip.timestamp > ip.ttl * 1000) {
      return this.pick(origin, hostnameRecords, affinity)
    }

    ip.timestamp = timestamp

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

  getRecords (origin) {
    return this.#records.get(origin.hostname)
  }

  deleteRecord (origin) {
    this.#records.delete(origin.hostname)
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
          const origin = this.#origin
          const instance = this.#state
          const ips = instance.getRecords(origin)

          // If no IPs we lookup
          if (ips == null) {
            instance.lookup(origin, this.#opts, (err, addresses) => {
              if (err) {
                return this.#handler.onError(err)
              }

              instance.setRecords(origin, addresses)

              const ip = instance.pick(
                origin,
                instance.getRecords(origin),
                instance.lastIpFamily === 4 ? 6 : 4
              )
              const opts = {
                ...this.#opts,
                origin: `${origin.protocol}//${
                  ip.family === 6 ? `[${ip.address}]` : ip.address
                }${origin.port === '' ? '' : `:${origin.port}`}`
              }

              this.#dispatch(opts, this)
            })
          } else {
            // If there's IPs we pick
            const ip = instance.pick(
              origin,
              instance.getRecords(origin),
              instance.lastIpFamily === 4 ? 6 : 4
            )

            const opts = {
              ...this.#opts,
              origin: `${origin.protocol}//${
                ip.family === 6 ? `[${ip.address}]` : ip.address
              }${origin.port === '' ? '' : `:${origin.port}`}`
            }

            this.#dispatch(opts, this)
          }
          // if dual-stack disabled, we error out
          return
        }
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
  // TODO: verify opts
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

      const ips = instance.getRecords(origin)

      // If no IPs we lookup
      if (ips == null) {
        instance.lookup(origin, opts, (err, addresses) => {
          if (err) {
            return handler.onError(err)
          }

          instance.setRecords(origin, addresses)

          const ip = instance.pick(
            origin,
            instance.getRecords(origin),
            origDispatchOpts.dns?.affinity
          )

          const dispatchOpts = {
            ...origDispatchOpts,
            origin: `${origin.protocol}//${
              ip.family === 6 ? `[${ip.address}]` : ip.address
            }${origin.port === '' ? '' : `:${origin.port}`}`
          }

          dispatch(
            dispatchOpts,
            instance.getHandler(
              { origin, dispatch, handler },
              { ...opts, ...origDispatchOpts }
            )
          )
        })
      } else {
        // If there's IPs we pick
        const records = instance.getRecords(origin)
        const ip = instance.pick(
          origin,
          records,
          origDispatchOpts.dns?.affinity
        )

        const dispatchOpts = {
          ...origDispatchOpts,
          origin: `${origin.protocol}//${
            ip.family === 6 ? `[${ip.address}]` : ip.address
          }${origin.port === '' ? '' : `:${origin.port}`}`
        }

        return dispatch(
          dispatchOpts,
          instance.getHandler(
            { origin, dispatch, handler },
            { ...opts, ...origDispatchOpts }
          )
        )
      }

      return true
    }
  }
}
