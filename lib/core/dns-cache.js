const {
  promises: dnsPromises,
  lookup: _dnsLookup
} = require('node:dns')
const os = require('node:os')
const { promisify } = require('node:util')

const { Resolver: AsyncResolver } = dnsPromises
const dnsLookup = promisify(_dnsLookup)

const cache = new Map()
const _pending = new Map()
const hostnamesToFallback = new Set()

const resolver = new AsyncResolver()
const maxTtl = Infinity
const fallbackDuration = 3600
const errorTtl = 0.15
let _nextRemovalTime = false
let _removalTimeout = null

let cacheEnabled = true

function enableCacheLookup () {
  cacheEnabled = true
}

function disableCacheLookup () {
  cacheEnabled = false
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

function ignoreNoResultErrors (dnsPromise) {
  return dnsPromise.catch(error => {
    switch (error.code) {
      case 'ENODATA':
      case 'ENOTFOUND':
      case 'ENOENT':
        return []
      default:
        throw error
    }
  })
}

const ttl = { ttl: true }
const all = { all: true }
const all4 = { all: true, family: 4 }
const all6 = { all: true, family: 6 }
const { has6 } = getIfaceInfo()

function lookup (hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options
    options = {}
  } else if (typeof options === 'number') {
    options = { family: options }
  }

  if (!callback) {
    throw new Error('Function needs callback')
  }

  lookupAsync(hostname).then((result) => {
    // @TODO remove
    console.log(result.address)
    callback(null, result.address, result.family, result.expires, result.ttl)
  }, callback)
}

async function lookupAsync (hostname) {
  const cached = await query(hostname)
  let filtered = []

  // IMOH (antoinegomez) we should always prioritize ipv6 if iface available and dns resolved
  // @TODO better filter options to allow to pool through ipv6 + v4
  if (has6) {
    filtered = cached.filter(entry => entry.family === 6)

    // if not v6 returned reset to the results, should be v4 only or empty
    if (filtered.length === 0) {
      filtered = cached
    }
  } else {
    filtered = cached.filter(entry => entry.family === 4)
  }

  if (filtered.length === 0) {
    const error = new Error(`dnsLookup ENOTFOUND ${hostname}`)
    error.code = 'ENOTFOUND'
    error.hostname = hostname
    throw error
  }

  // return random result, better for balancing
  // @TODO: keep track of usage or loop through filtered results instead?
  return filtered[Math.floor(Math.random() * filtered.length)]
}

async function query (hostname) {
  let cached = cache.get(hostname)

  if (!cached || cacheEnabled === false) {
    const pending = _pending.get(hostname)
    if (pending) {
      cached = await pending
    } else {
      const newPromise = queryAndCache(hostname)
      _pending.set(hostname, newPromise)
      try {
        cached = await newPromise
      } finally {
        _pending.delete(hostname)
      }
    }
  }

  return cached
}

async function queryAndCache (hostname) {
  if (hostnamesToFallback.has(hostname)) {
    return dnsLookup(hostname, all)
  }

  let query = await resolve(hostname)

  if (query.length === 0) {
    query = await _lookup(hostname)

    if (query.entries.length !== 0 && fallbackDuration > 0) {
      hostnamesToFallback(hostname)
    }
  }

  const cacheTtl = query.entries.length === 0 ? errorTtl : query.cacheTtl
  set(hostname, query.entries, cacheTtl)
  return query.entries
}

async function _lookup (hostname) {
  try {
    const [A, AAAA] = await Promise.all([
      ignoreNoResultErrors(dnsLookup(hostname, all4)),
      ignoreNoResultErrors(dnsLookup(hostname, all6))
    ])

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

async function resolve (hostname) {
  const [A, AAAA] = await Promise.all([
    ignoreNoResultErrors(resolver.resolve4(hostname, ttl)),
    ignoreNoResultErrors(resolver.resolve6(hostname, ttl))
  ])

  let cacheTtl = 0
  let aTtl = 0
  let aaaaTtl = 0

  for (const entry of AAAA) {
    entry.family = 6
    entry.expires = Date.now + entry.ttl * 1000
    aaaaTtl = Math.max(aaaaTtl, entry.ttl)
  }

  for (const entry of A) {
    entry.family = 4
    entry.expires = Date.now + entry.ttl * 1000
    aTtl = Math.max(aTtl, entry.ttl)
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

  // favourite ipv6 if available
  const result = [...AAAA, ...A]
  return { entries: result, cacheTtl }
}

function set (hostname, data, cacheTtl) {
  if (maxTtl > 0 && cacheTtl > 0) {
    cacheTtl = Math.min(cacheTtl, maxTtl) * 1000
    data.expires = Date.now() + cacheTtl
    cache.set(hostname, data)
    tick(cacheTtl)
  }
}

function tick (ms) {
  const nextRemovalTime = _nextRemovalTime

  if (!nextRemovalTime || ms < nextRemovalTime) {
    clearTimeout(_removalTimeout)

    _nextRemovalTime = ms

    _removalTimeout = setTimeout(() => {
      _nextRemovalTime = false

      let nextExpiry = Infinity

      const now = Date.now()

      for (const [hostname, entries] of cache) {
        const expires = entries.expires

        if (now >= expires) {
          cache.delete(hostname)
        } else if (expires < nextExpiry) {
          nextExpiry = expires
        }
      }

      if (nextExpiry !== Infinity) {
        tick(nextExpiry - now)
      }
    }, ms)

    /* istanbul ignore next: There is no `timeout.unref()` when running inside an Electron renderer */
    if (_removalTimeout.unref) {
      _removalTimeout.unref()
    }
  }
}

module.exports.lookup = lookup
module.exports.disableCacheLookup = disableCacheLookup
module.exports.enaleCacheLookup = enableCacheLookup
module.exports.dnsCacheEnabled = () => cacheEnabled
