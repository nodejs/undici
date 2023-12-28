const { promises: dnsPromises } = require('node:dns')
const os = require('node:os')

const { Resolver: AsyncResolver } = dnsPromises

const cache = new Map()

const resolver = new AsyncResolver()
const maxTtl = Infinity
let _nextRemovalTime = false
let _removalTimeout = undefined

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

const ttl = { ttl: true }

function lookup(hostname, options, callback) {
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
    callback(null, result.address, result.family, result.expires, result.ttl)
  }, callback)
}

async function lookupAsync(hostname) {
  const cached = cache.get(hostname)
  if (cached) {
    return cached
  }

  const { has6 } = getIfaceInfo()

  const [A, AAAA] = await Promise.all([
    resolver.resolve4(hostname, ttl),
    resolver.resolve6(hostname, ttl)
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
  let result
  if (has6 && AAAA.length) {
    result = AAAA[0]
  } else {
    result = A[0]
  }

  set(hostname, result, cacheTtl)

  return result
}

function set(hostname, data, cacheTtl) {
  if (maxTtl > 0 && cacheTtl > 0) {
    cacheTtl = Math.min(cacheTtl, maxTtl) * 1000
    data.expires = Date.now() + cacheTtl
    cache.set(hostname, data)
    tick(cacheTtl)
  }
}

function tick(ms) {
  const nextRemovalTime = _nextRemovalTime

  if (!nextRemovalTime || ms < nextRemovalTime) {
    clearTimeout(_removalTimeout)

    _nextRemovalTime = ms

    _removalTimeout = setTimeout(() => {
      _nextRemovalTime = false

      let nextExpiry = Infinity

      const now = Date.now()

      for (const [hostname, entries] of this._cache) {
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

module.exports = lookup
