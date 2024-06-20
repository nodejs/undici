'use strict'

// source: https://raw.githubusercontent.com/szmarczak/cacheable-lookup/9e60c9f6e74a003692aec68f3ddad93afe613b8f/source/index.mjs

/**

MIT License

Copyright (c) 2019 Szymon Marczak

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

const {
  V4MAPPED,
  ADDRCONFIG,
  ALL,
  promises: dnsPromises,
  lookup: dnsLookup
} = require('node:dns')
const { promisify } = require('node:util')
const os = require('node:os')
const { kDnsCacheSize, kDnsHostnamesToFallback, kExpires } = require('./core/symbols')

const { Resolver: AsyncResolver } = dnsPromises

const roundRobinStrategies = ['first', 'random']

const map4to6 = (entries) => {
  for (const entry of entries) {
    if (entry.family === 6) {
      continue
    }

    entry.address = `::ffff:${entry.address}`
    entry.family = 6
  }
}

const getIfaceInfo = () => {
  let has4 = false
  let has6 = false

  for (const device of Object.values(os.networkInterfaces())) {
    for (const iface of device) {
      if (iface.internal) {
        continue
      }

      if (iface.family === 'IPv6') {
        has6 = true
      } else {
        has4 = true
      }

      if (has4 && has6) {
        return { has4, has6 }
      }
    }
  }

  return { has4, has6 }
}

const isIterable = (map) => {
  return Symbol.iterator in map
}

const ignoreNoResultErrors = (dnsPromise) => {
  return dnsPromise.catch((error) => {
    if (
      error.code === 'ENODATA' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ENOENT' // Windows: name exists, but not this record type
    ) {
      return []
    }

    throw error
  })
}

const ttl = { ttl: true }
const all = { all: true }
const all4 = { all: true, family: 4 }
const all6 = { all: true, family: 6 }

class DNSResolver {
  #resolver
  #cache
  #dnsLookup
  #iface
  #pending = {}
  #nextRemovalTime = false
  #fallbackDuration
  #removalTimeout
  #hostnamesToFallback = new Set()
  #resolve4
  #resolve6
  #scheduling

  constructor ({
    cache = new Map(),
    maxTtl = Infinity,
    fallbackDuration = 3600,
    errorTtl = 0.15,
    resolver = new AsyncResolver(),
    lookup = dnsLookup,
    lookupOptions,
    scheduling = 'first'
  } = {}) {
    this.maxTtl = maxTtl
    this.errorTtl = errorTtl

    if (roundRobinStrategies.includes(scheduling) === false) {
      throw new Error(`roundRobinStrategy must be one of: ${roundRobinStrategies.join(', ')}`)
    }

    this.#scheduling = scheduling

    this.#cache = cache
    this.#resolver = resolver
    this.#dnsLookup = lookup && promisify(lookup)
    this.stats = {
      cache: 0,
      query: 0
    }

    if (this.#resolver instanceof AsyncResolver) {
      this.#resolve4 = this.#resolver.resolve4.bind(this.#resolver)
      this.#resolve6 = this.#resolver.resolve6.bind(this.#resolver)
    } else {
      this.#resolve4 = promisify(this.#resolver.resolve4.bind(this.#resolver))
      this.#resolve6 = promisify(this.#resolver.resolve6.bind(this.#resolver))
    }

    this.#iface = getIfaceInfo()

    this.#pending = {}
    this.#nextRemovalTime = false
    this.#hostnamesToFallback = new Set()

    this.#fallbackDuration = fallbackDuration

    if (fallbackDuration > 0) {
      const interval = setInterval(() => {
        this.#hostnamesToFallback.clear()
      }, fallbackDuration * 1000)

      /* istanbul ignore next: There is no `interval.unref()` when running inside an Electron renderer */
      if (interval.unref) {
        interval.unref()
      }
    }

    if (lookupOptions) {
      this.lookup = (hostname, _options, callback) => this.#lookup(hostname, lookupOptions, callback)
    } else {
      this.lookup = this.#lookup.bind(this)
    }
    this.lookupAsync = this.lookupAsync.bind(this)
  }

  get [kDnsCacheSize] () {
    return this.#cache.size ?? 0
  }

  get [kDnsHostnamesToFallback] () {
    return this.#hostnamesToFallback.size ?? 0
  }

  set servers (servers) {
    this.clear()

    this.#resolver.setServers(servers)
  }

  get servers () {
    return this.#resolver.getServers()
  }

  #lookup (hostname, options, callback) {
    if (typeof options === 'function') {
      callback = options
      options = {}
    } else if (typeof options === 'number') {
      options = {
        family: options
      }
    }

    if (!callback) {
      throw new Error('Callback must be a function.')
    }

    // eslint-disable-next-line promise/prefer-await-to-then
    this.lookupAsync(hostname, options).then((result) => {
      if (options.all) {
        callback(null, result)
      } else {
        callback(
          null,
          result.address,
          result.family,
          result.expires,
          result.ttl
        )
      }
    }, callback)
  }

  async lookupAsync (hostname, options = {}) {
    if (typeof options === 'number') {
      options = {
        family: options
      }
    }

    let cached = await this.query(hostname)

    if (options.family === 6) {
      const filtered = []
      for (const entry of cached) {
        if (entry.family === 6) {
          filtered.push(entry)
        }
      }
      if (options.hints & V4MAPPED) {
        if ((options.hints & ALL) || filtered.length === 0) {
          map4to6(cached)
        } else {
          cached = filtered
        }
      } else {
        cached = filtered
      }
    } else if (options.family === 4) {
      const filtered = []
      for (const entry of cached) {
        if (entry.family === 4) {
          filtered.push(entry)
        }
      }
      cached = filtered
    }

    if (options.hints & ADDRCONFIG) {
      const filtered = []
      for (const entry of cached) {
        if (entry.family === 6 && this.#iface.has6) {
          filtered.push(entry)
        } else if (entry.family === 4 && this.#iface.has4) {
          filtered.push(entry)
        }
      }
      cached = filtered
    }

    if (cached.length === 0) {
      const error = new Error(`DNSResolver ENOTFOUND ${hostname}`)
      error.code = 'ENOTFOUND'
      error.hostname = hostname

      throw error
    }

    if (options.all) {
      return cached
    }

    if (this.#scheduling === 'first') {
      return cached[0]
    } else {
      // random
      return cached[Math.floor(Math.random() * cached.length)]
    }
  }

  async query (hostname) {
    let cached = await this.#cache.get(hostname)

    if (cached) {
      this.stats.cache++
    }

    if (!cached) {
      const pending = this.#pending[hostname]
      if (pending) {
        this.stats.cache++
        cached = await pending
      } else {
        const newPromise = this.queryAndCache(hostname)
        this.#pending[hostname] = newPromise
        this.stats.query++
        try {
          cached = await newPromise
        } finally {
          delete this.#pending[hostname]
        }
      }
    }

    return cached
  }

  async #resolve (hostname) {
    // ANY is unsafe as it doesn't trigger new queries in the underlying server.
    const entries = await Promise.allSettled([
      ignoreNoResultErrors(this.#resolve4(hostname, ttl)),
      ignoreNoResultErrors(this.#resolve6(hostname, ttl))
    ])

    if (entries[0].status === 'rejected' && entries[1].status === 'rejected') {
      const error = new AggregateError([
        entries[0].reason,
        entries[1].reason
      ], `All resolvers failed for hostname: ${hostname}`)
      throw error
    }

    const A = entries[0].status === 'fulfilled' ? entries[0].value : []
    const AAAA = entries[1].status === 'fulfilled' ? entries[1].value : []

    let aTtl = 0
    let aaaaTtl = 0
    let cacheTtl = 0

    const now = Date.now()

    for (const entry of A) {
      entry.family = 4
      entry.expires = now + entry.ttl * 1000

      aTtl = Math.max(aTtl, entry.ttl)
    }

    for (const entry of AAAA) {
      entry.family = 6
      entry.expires = now + entry.ttl * 1000

      aaaaTtl = Math.max(aaaaTtl, entry.ttl)
    }

    if (A.length > 0) {
      if (AAAA.length > 0) {
        cacheTtl = Math.min(aTtl, aaaaTtl)
      } else {
        cacheTtl = aTtl
      }
    } else {
      cacheTtl = aaaaTtl
    }

    return {
      entries: [...AAAA, ...A],
      cacheTtl
    }
  }

  async #lookupViaDns (hostname) {
    try {
      const entries = await Promise.allSettled([
        // Passing {all: true} doesn't return all IPv4 and IPv6 entries.
        // See https://github.com/szmarczak/cacheable-lookup/issues/42
        ignoreNoResultErrors(this.#dnsLookup(hostname, all4)),
        ignoreNoResultErrors(this.#dnsLookup(hostname, all6))
      ])

      if (entries[0].status === 'rejected' && entries[1].status === 'rejected') {
        const error = new AggregateError([
          entries[0].reason,
          entries[1].reason
        ], `All resolvers failed for hostname: ${hostname}`)
        throw error
      }

      const A = entries[0].status === 'fulfilled' ? entries[0].value : []
      const AAAA = entries[1].status === 'fulfilled' ? entries[1].value : []

      return {
        entries: [...AAAA, ...A],
        cacheTtl: 0
      }
    } catch {
      return {
        entries: [],
        cacheTtl: 0
      }
    }
  }

  async #set (hostname, data, cacheTtl) {
    if (this.maxTtl > 0 && cacheTtl > 0) {
      cacheTtl = Math.min(cacheTtl, this.maxTtl) * 1000
      data[kExpires] = Date.now() + cacheTtl

      try {
        await this.#cache.set(hostname, data, cacheTtl)
      } catch (error) {
        this.lookupAsync = async () => {
          const cacheError = new Error(
            'Cache Error. Please recreate the DNSResolver instance.'
          )
          cacheError.cause = error

          throw cacheError
        }
      }

      if (isIterable(this.#cache)) {
        this.#tick(cacheTtl)
      }
    }
  }

  async queryAndCache (hostname) {
    if (this.#hostnamesToFallback.has(hostname)) {
      return this.#dnsLookup(hostname, all)
    }

    let query = await this.#resolve(hostname)

    if (query.entries.length === 0 && this.#dnsLookup) {
      query = await this.#lookupViaDns(hostname)

      if (query.entries.length !== 0 && this.#fallbackDuration > 0) {
        // Use `dns.lookup(...)` for that particular hostname
        this.#hostnamesToFallback.add(hostname)
      }
    }

    const cacheTtl = query.entries.length === 0 ? this.errorTtl : query.cacheTtl
    await this.#set(hostname, query.entries, cacheTtl)

    return query.entries
  }

  #tick (ms) {
    const nextRemovalTime = this.#nextRemovalTime

    if (!nextRemovalTime || ms < nextRemovalTime) {
      clearTimeout(this.#removalTimeout)

      this.#nextRemovalTime = ms

      this.#removalTimeout = setTimeout(() => {
        this.#nextRemovalTime = false

        let nextExpiry = Infinity

        const now = Date.now()

        for (const [hostname, entries] of this.#cache) {
          const expires = entries[kExpires]

          if (now >= expires) {
            this.#cache.delete(hostname)
          } else if (expires < nextExpiry) {
            nextExpiry = expires
          }
        }

        if (nextExpiry !== Infinity) {
          this.#tick(nextExpiry - now)
        }
      }, ms)

      /* istanbul ignore next: There is no `timeout.unref()` when running inside an Electron renderer */
      if (this.#removalTimeout.unref) {
        this.#removalTimeout.unref()
      }
    }
  }

  updateInterfaceInfo () {
    const iface = this.#iface

    this.#iface = getIfaceInfo()

    if (
      (iface.has4 && !this.#iface.has4) ||
      (iface.has6 && !this.#iface.has6)
    ) {
      this.#cache.clear()
    }
  }

  clear (hostname) {
    if (hostname) {
      this.#cache.delete(hostname)
      return
    }

    this.#cache.clear()
  }
}

module.exports = DNSResolver
