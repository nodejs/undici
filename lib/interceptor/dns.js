'use strict'
const { isIP } = require('node:net')
const { lookup } = require('node:dns')
const DecoratorHandler = require('../handler/decorator-handler')
const maxInt = Math.pow(2, 31) - 1

class DNSInstance {
  #maxTTL = 0 // TODO: support TTL
  dualStack = true
  record = new Map()
  lookup = null
  pick = null
  lastIpFamily = null

  constructor (opts) {
    this.#maxTTL = opts.maxTTL
    this.dualStack = opts.dualStack
    this.lookup = opts.lookup ?? this.#defaultLookup
    this.pick = opts.pick ?? this.#defaultPick
  }

  #defaultLookup (origin, opts, callback) {
    // TODO: replace for resolve
    lookup(origin.hostname, { all: true }, (err, addresses) => {
      if (err) {
        return callback(err)
      }

      const results = addresses.map(addr => {
        return {
          address: addr.address,
          ttl: opts.maxTTL,
          family: addr.family
        }
      })

      const records = results.reduce(
        (acc, record) => {
          if (record.family === 4) {
            acc[4].ips.push({ address: record.address, ttl: record.ttl })
          } else {
            acc[6].ips.push({ address: record.address, ttl: record.ttl })
          }

          return acc
        },
        { 4: { ips: [] }, 6: { ips: [] } }
      )

      this.record.set(origin.hostname, { records })

      callback(null, records)
    })
  }

  #defaultPick (origin, hostnameRecords, affinity) {
    const { records, offset = 0 } = this.record.get(origin.hostname)
    let newOffet = 0

    if (offset === maxInt) {
      newOffet = 0
    } else {
      newOffet = offset + 1
    }

    // We balance between the two IP families
    const family =
      records[affinity] ??
      records[(this.lastIpFamily = (newOffet & 1) === 1 ? 4 : 6)]
    family.offset = family.offset ?? 0
    hostnameRecords.offset = newOffet

    if (family.offset === maxInt) {
      family.offset = 0
    } else {
      family.offset++
    }

    const ip = family.ips[family.offset % family.ips.length]

    if (ip.timestamp != null && Date.now() - ip.timestamp > ip.ttl * 1000) {
      return this.pick(origin, hostnameRecords, affinity)
    }

    ip.timestamp = Date.now()

    return ip
  }

  /**
   * TODO: re-evaluate
   *
   * So far it seems that this can be better offloaded to the handler
   * especially if we want to handle situations where the request failed
   * and we want to support try again on another IP family.
   */

  getHandler (handler) {
    return new DNSDispatchHandler(this, handler)
  }
}

class DNSDispatchHandler extends DecoratorHandler {
  #state = null
  #opts = null
  #dispatch = null
  #handler = null

  constructor (state, { handler, dispatch }, opts) {
    super(handler)
    this.#handler = handler
    this.#opts = { ...opts }
    this.#state = state
    this.#dispatch = dispatch
  }

  onError (err) {
    switch (err.code) {
      case 'ETIMEDOUT':
      case 'ECONNREFUSED': {
        // Abstract into a method
        if (this.#state.dualStack) {
          const ips = this.#state.record.get(this.origin.hostname)
          // If no IPs we lookup
          if (ips == null) {
            this.#state.lookup(this.origin, this.#opts, (err, addresses) => {
              if (err) {
                return this.#handler.onError(err)
              }

              const ip = this.#state.pick(
                this.origin,
                addresses,
                this.#state.lastIpFamily === 4 ? 6 : this.#state.lastIpFamily
              )
              const opts = { ...this.#opts, origin: ip.address }
              this.#dispatch(opts, this)
            })
          }

          // If there's IPs we pick
          const ip = this.#state.pick(
            this.opts.origin,
            this.#state.lastIpFamily === '4' ? '6' : this.#state.lastIpFamily
          )

          const opts = { ...this.#opts, origin: ip.address }
          this.#dispatch(opts, this)
        }

        return
      }
      case 'ENOTFOUND':
        this.#state.record.delete(this.origin.hostname)
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
    maxTTL: interceptorOpts?.maxTTL ?? 10, // Expressed in seconds
    resolve: interceptorOpts?.resolve ?? null,
    pick: interceptorOpts?.pick ?? null,
    dualStack: interceptorOpts?.dualStack ?? true
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

      const ips = instance.record.get(origin.hostname)

      // If no IPs we lookup
      if (ips == null) {
        instance.lookup(origin, opts, (err, addresses) => {
          if (err) {
            return handler.onError(err)
          }

          const ip = instance.pick(
            origin,
            addresses,
            origDispatchOpts.dns?.affinity
          )

          const dispatchOpts = {
            ...origDispatchOpts,
            origin: `${origin.protocol}//${ip.address}${
              origin.port === '' ? '' : `:${origin.port}`
            }`
          }

          dispatch(
            dispatchOpts,
            instance.getHandler(
              { dispatch, handler },
              { ...opts, ...origDispatchOpts }
            )
          )
        })
      } else {
        // If there's IPs we pick
        const ip = instance.pick(origin, origDispatchOpts.dns?.affinity)

        const dispatchOpts = {
          ...origDispatchOpts,
          origin: `${origin.protocol}//${ip.address}${
            origin.port === '' ? '' : `:${origin.port}`
          }`
        }

        return dispatch(
          dispatchOpts,
          instance.getHandler(
            { dispatch, handler },
            { ...opts, ...origDispatchOpts }
          )
        )
      }

      // TODO: or shall we ask for room to breathe?
      return true
    }
  }
}
