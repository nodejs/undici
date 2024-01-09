'use strict'

// source: https://raw.githubusercontent.com/szmarczak/cacheable-lookup/9e60c9f6e74a003692aec68f3ddad93afe613b8f/tests/test.mjs

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

const { promises: dnsPromises, V4MAPPED, ADDRCONFIG, ALL } = require('node:dns')
const { promisify } = require('node:util')
const http = require('node:http')
const { test } = require('tap')
const originalDns = require('node:dns')
const proxyquire = require('proxyquire')
const osStub = {}
const dnsStub = {
  ...originalDns
}

const { Resolver: AsyncResolver } = dnsPromises

const makeRequest = (options) =>
  new Promise((resolve, reject) => {
    http.get(options, resolve).once('error', reject)
  })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const mockedInterfaces = async (options) => {
  const createInterfaces = (options = {}) => {
    const interfaces = {
      lo: [
        {
          internal: true
        }
      ],
      eth0: []
    }

    if (options.has4) {
      interfaces.eth0.push({
        address: '192.168.0.111',
        netmask: '255.255.255.0',
        family: 'IPv4',
        mac: '00:00:00:00:00:00',
        internal: false,
        cidr: '192.168.0.111/24'
      })
    }

    if (options.has6) {
      interfaces.eth0.push({
        address: 'fe80::c962:2946:a4e2:9f05',
        netmask: 'ffff:ffff:ffff:ffff::',
        family: 'IPv6',
        mac: '00:00:00:00:00:00',
        scopeid: 8,
        internal: false,
        cidr: 'fe80::c962:2946:a4e2:9f05/64'
      })
    }

    return interfaces
  }

  let interfaces = createInterfaces(options)

  const _updateInterfaces = (options = {}) => {
    interfaces = createInterfaces(options)
  }

  osStub.networkInterfaces = function () {
    return interfaces
  }

  DNSResolver._updateInterfaces = _updateInterfaces
  return DNSResolver
}

const createResolver = () => {
  let counter = {
    4: 0,
    6: 0,
    lookup: 0
  }

  const resolver = {
    servers: ['127.0.0.1'],
    getServers () {
      return [...resolver.servers]
    },
    setServers (servers) {
      resolver.servers = [...servers]
    },
    resolve: (hostname, options, callback) => {
      let data
      for (const server of resolver.servers) {
        if (resolver.data[server][hostname]) {
          data = resolver.data[server][hostname]
          break
        }
      }

      if (hostname === 'econnrefused') {
        const error = new Error(`ECONNREFUSED ${hostname}`)
        error.code = 'ECONNREFUSED'

        callback(error)
        return
      }

      if (!data) {
        const error = new Error(`ENOTFOUND ${hostname}`)
        error.code = 'ENOTFOUND'

        callback(error)
        return
      }

      if (data.length === 0) {
        const error = new Error(`ENODATA ${hostname}`)
        error.code = 'ENODATA'

        callback(error)
        return
      }

      if (options.family === 4 || options.family === 6) {
        data = data.filter((entry) => entry.family === options.family)
      }

      callback(null, JSON.parse(JSON.stringify(data)))
    },
    resolve4: (hostname, options, callback) => {
      counter[4]++

      return resolver.resolve(hostname, { ...options, family: 4 }, callback)
    },
    resolve6: (hostname, options, callback) => {
      counter[6]++

      return resolver.resolve(hostname, { ...options, family: 6 }, callback)
    },
    lookup: (hostname, options, callback) => {
      // No need to implement hints yet

      counter.lookup++

      if (!resolver.lookupData[hostname]) {
        const error = new Error(`ENOTFOUND ${hostname}`)
        error.code = 'ENOTFOUND'
        error.hostname = hostname

        callback(error)
        return
      }

      let entries = resolver.lookupData[hostname]

      if (options.family === 4 || options.family === 6) {
        entries = entries.filter((entry) => entry.family === options.family)
      }

      if (options.all) {
        callback(null, entries)
        return
      }

      callback(null, entries[0])
    },
    data: {
      '127.0.0.1': {
        agentdns: [
          { address: '127.0.0.1', family: 4, ttl: 60 }
        ],
        localhost: [
          { address: '127.0.0.1', family: 4, ttl: 60 },
          { address: '::ffff:127.0.0.2', family: 6, ttl: 60 }
        ],
        example: [{ address: '127.0.0.127', family: 4, ttl: 60 }],
        temporary: [{ address: '127.0.0.1', family: 4, ttl: 1 }],
        twoSeconds: [{ address: '127.0.0.1', family: 4, ttl: 2 }],
        ttl: [{ address: '127.0.0.1', family: 4, ttl: 1 }],
        maxTtl: [{ address: '127.0.0.1', family: 4, ttl: 60 }],
        static4: [{ address: '127.0.0.1', family: 4, ttl: 1 }],
        zeroTtl: [{ address: '127.0.0.127', family: 4, ttl: 0 }],
        multiple: [
          { address: '127.0.0.127', family: 4, ttl: 0 },
          { address: '127.0.0.128', family: 4, ttl: 0 }
        ],
        outdated: [{ address: '127.0.0.1', family: 4, ttl: 1 }]
      },
      '192.168.0.100': {
        unique: [{ address: '127.0.0.1', family: 4, ttl: 60 }]
      }
    },
    lookupData: {
      osHostname: [
        { address: '127.0.0.1', family: 4 },
        { address: '127.0.0.2', family: 4 }
      ],
      outdated: [{ address: '127.0.0.127', family: 4 }]
    },
    get counter () {
      return counter
    },
    resetCounter () {
      counter = {
        4: 0,
        6: 0,
        lookup: 0
      }
    }
  }

  return resolver
}

const resolver = createResolver()
dnsStub.lookup = resolver.lookup
const DNSResolver = proxyquire('../lib/dns-resolver', {
  'node:os': osStub,
  'node:dns': dnsStub
})

const verify = (t, entry, value) => {
  if (Array.isArray(value)) {
    // eslint-disable-next-line guard-for-in
    for (const key in value) {
      t.equal(
        typeof entry[key].expires === 'number' &&
          entry[key].expires >= Date.now() - 1000,
        true
      )
      t.equal(typeof entry[key].ttl === 'number' && entry[key].ttl >= 0, true)

      if (!('ttl' in value[key]) && 'ttl' in entry[key]) {
        value[key].ttl = entry[key].ttl
      }

      if (!('expires' in value[key]) && 'expires' in entry[key]) {
        value[key].expires = entry[key].expires
      }
    }
  } else {
    t.equal(
      typeof entry.expires === 'number' && entry.expires >= Date.now() - 1000,
      true
    )
    t.equal(typeof entry.ttl === 'number' && entry.ttl >= 0, true)

    if (!('ttl' in value)) {
      value.ttl = entry.ttl
    }

    if (!('expires' in value)) {
      value.expires = entry.expires
    }
  }

  t.same(entry, value)
}

test('options.family', async (t) => {
  const cacheable = new DNSResolver({ resolver })

  // IPv4
  let entry = await cacheable.lookupAsync('localhost', { family: 4 })
  verify(t, entry, {
    address: '127.0.0.1',
    family: 4
  })

  // IPv6
  entry = await cacheable.lookupAsync('localhost', { family: 6 })
  verify(t, entry, {
    address: '::ffff:127.0.0.2',
    family: 6
  })
})

test('options.all', async (t) => {
  const cacheable = new DNSResolver({ resolver })

  const entries = await cacheable.lookupAsync('localhost', { all: true })
  verify(t, entries, [
    { address: '::ffff:127.0.0.2', family: 6 },
    { address: '127.0.0.1', family: 4 }
  ])
})

test('options.all mixed with options.family', async (t) => {
  const cacheable = new DNSResolver({ resolver })

  // IPv4
  let entries = await cacheable.lookupAsync('localhost', {
    all: true,
    family: 4
  })
  verify(t, entries, [{ address: '127.0.0.1', family: 4 }])

  // IPv6
  entries = await cacheable.lookupAsync('localhost', { all: true, family: 6 })
  verify(t, entries, [{ address: '::ffff:127.0.0.2', family: 6 }])
})

test('V4MAPPED hint', async (t) => {
  const cacheable = new DNSResolver({ resolver })

  // Make sure default behavior is right
  await t.rejects(cacheable.lookupAsync('static4', { family: 6 }), {
    code: 'ENOTFOUND'
  })

  // V4MAPPED
  {
    const entries = await cacheable.lookupAsync('static4', {
      family: 6,
      hints: V4MAPPED
    })
    verify(t, entries, { address: '::ffff:127.0.0.1', family: 6 })
  }

  {
    const entries = await cacheable.lookupAsync('localhost', {
      family: 6,
      hints: V4MAPPED
    })
    verify(t, entries, { address: '::ffff:127.0.0.2', family: 6 })
  }
})

if (process.versions.node.split('.')[0] >= 14) {
  test('ALL hint', async (t) => {
    const cacheable = new DNSResolver({ resolver })

    // ALL
    const entries = await cacheable.lookupAsync('localhost', {
      family: 6,
      hints: V4MAPPED | ALL,
      all: true
    })

    verify(t, entries, [
      { address: '::ffff:127.0.0.2', family: 6, ttl: 60 },
      { address: '::ffff:127.0.0.1', family: 6, ttl: 60 }
    ])
  })
}

test('ADDRCONFIG hint', async (t) => {
  // => has6 = false, family = 6
  {
    const DNSResolver = await mockedInterfaces({ has4: true, has6: false })
    const cacheable = new DNSResolver({ resolver })

    await t.rejects(
      cacheable.lookupAsync('localhost', { family: 6, hints: ADDRCONFIG }),
      { code: 'ENOTFOUND' }
    )
  }

  // => has6 = true, family = 6
  {
    const DNSResolver = await mockedInterfaces({ has4: true, has6: true })
    const cacheable = new DNSResolver({ resolver })

    verify(
      t,
      await cacheable.lookupAsync('localhost', {
        family: 6,
        hints: ADDRCONFIG
      }),
      {
        address: '::ffff:127.0.0.2',
        family: 6
      }
    )
  }

  // => has4 = false, family = 4
  {
    const DNSResolver = await mockedInterfaces({ has4: false, has6: true })
    const cacheable = new DNSResolver({ resolver })

    await t.rejects(
      cacheable.lookupAsync('localhost', { family: 4, hints: ADDRCONFIG }),
      { code: 'ENOTFOUND' }
    )
  }

  // => has4 = true, family = 4
  {
    const DNSResolver = await mockedInterfaces({ has4: true, has6: true })
    const cacheable = new DNSResolver({ resolver })

    verify(
      t,
      await cacheable.lookupAsync('localhost', {
        family: 4,
        hints: ADDRCONFIG
      }),
      {
        address: '127.0.0.1',
        family: 4
      }
    )
  }

  // Update interface info
  {
    const DNSResolver = await mockedInterfaces({ has4: false, has6: true })
    const cacheable = new DNSResolver({ resolver })

    await t.rejects(
      cacheable.lookupAsync('localhost', { family: 4, hints: ADDRCONFIG }),
      { code: 'ENOTFOUND' }
    )

    // => has4 = true, family = 4
    DNSResolver._updateInterfaces({ has4: true, has6: true }) // Override os.networkInterfaces()
    cacheable.updateInterfaceInfo()

    verify(
      t,
      await cacheable.lookupAsync('localhost', {
        family: 4,
        hints: ADDRCONFIG
      }),
      {
        address: '127.0.0.1',
        family: 4
      }
    )
  }
})

test('caching works', async (t) => {
  const cacheable = new DNSResolver({ resolver })

  // Make sure default behavior is right
  let entries = await cacheable.lookupAsync('temporary', {
    all: true,
    family: 4
  })
  verify(t, entries, [{ address: '127.0.0.1', family: 4 }])

  // Update DNS data
  const resovlerEntry = resolver.data['127.0.0.1'].temporary[0]
  const { address: resolverAddress } = resovlerEntry
  resovlerEntry.address = '127.0.0.2'

  // Lookup again returns cached data
  entries = await cacheable.lookupAsync('temporary', { all: true, family: 4 })
  verify(t, entries, [{ address: '127.0.0.1', family: 4 }])

  // Restore back
  resovlerEntry.address = resolverAddress
})

test('respects ttl', async (t) => {
  const cacheable = new DNSResolver({ resolver })

  // Make sure default behavior is right
  let entries = await cacheable.lookupAsync('ttl', { all: true, family: 4 })
  verify(t, entries, [{ address: '127.0.0.1', family: 4 }])

  // Update DNS data
  const resolverEntry = resolver.data['127.0.0.1'].ttl[0]
  const { address: resolverAddress } = resolverEntry
  resolverEntry.address = '127.0.0.2'

  // Wait until it expires
  await sleep(resolverEntry.ttl * 1000 + 1)

  // Lookup again
  entries = await cacheable.lookupAsync('ttl', { all: true, family: 4 })
  verify(t, entries, [{ address: '127.0.0.2', family: 4 }])

  // Restore back
  resolverEntry.address = resolverAddress
})

test('throw when there are entries available but not for the requested family', async (t) => {
  const cacheable = new DNSResolver({ resolver })

  await t.rejects(cacheable.lookupAsync('static4', { family: 6 }), {
    code: 'ENOTFOUND'
  })
})

test('custom servers', async (t) => {
  const cacheable = new DNSResolver({ resolver: createResolver() })

  // .servers (get)
  t.same(cacheable.servers, ['127.0.0.1'])
  await t.rejects(cacheable.lookupAsync('unique'), { code: 'ENOTFOUND' })

  // .servers (set)
  cacheable.servers = ['127.0.0.1', '192.168.0.100']
  verify(t, await cacheable.lookupAsync('unique'), {
    address: '127.0.0.1',
    family: 4
  })

  // Verify
  t.same(cacheable.servers, ['127.0.0.1', '192.168.0.100'])
})

test('callback style', async (t) => {
  const cacheable = new DNSResolver({ resolver })

  // Custom promise for this particular test
  const lookup = (...args) =>
    new Promise((resolve, reject) => {
      cacheable.lookup(...args, (error, ...data) => {
        if (error) {
          reject(error)
        } else {
          resolve(data)
        }
      })
    })

  // Without options
  let result = await lookup('localhost')
  t.equal(result.length, 4)
  t.equal(result[0], '::ffff:127.0.0.2')
  t.equal(result[1], 6)
  t.equal(typeof result[2] === 'number' && result[2] >= Date.now() - 1000, true)
  t.equal(typeof result[3] === 'number' && result[3] >= 0, true)

  // With options
  result = await lookup('localhost', { family: 4, all: true })
  t.equal(result.length, 1)
  verify(t, result[0], [{ address: '127.0.0.1', family: 4 }])
})

test('works', async (t) => {
  const cacheable = new DNSResolver({ resolver })

  verify(t, await cacheable.lookupAsync('localhost'), {
    address: '::ffff:127.0.0.2',
    family: 6
  })
})

test('options.maxTtl', async (t) => {
  // => maxTtl = 1
  {
    const cacheable = new DNSResolver({ resolver, maxTtl: 1 })

    // Make sure default behavior is right
    verify(t, await cacheable.lookupAsync('maxTtl'), {
      address: '127.0.0.1',
      family: 4
    })

    // Update DNS data
    const resolverEntry = resolver.data['127.0.0.1'].maxTtl[0]
    resolverEntry.address = '127.0.0.2'

    // Wait until it expires
    await sleep(cacheable.maxTtl * 1000 + 10)

    // Lookup again
    verify(t, await cacheable.lookupAsync('maxTtl'), {
      address: '127.0.0.2',
      family: 4
    })

    // Reset
    resolverEntry.address = '127.0.0.1'
  }

  // => maxTtl = 0
  {
    const cacheable = new DNSResolver({ resolver, maxTtl: 0 })

    // Make sure default behavior is right
    verify(t, await cacheable.lookupAsync('maxTtl'), {
      address: '127.0.0.1',
      family: 4
    })

    // Update DNS data
    const resolverEntry = resolver.data['127.0.0.1'].maxTtl[0]
    resolverEntry.address = '127.0.0.2'

    // Wait until it expires
    await sleep(cacheable.maxTtl * 1000 + 1)

    // Lookup again
    verify(t, await cacheable.lookupAsync('maxTtl'), {
      address: '127.0.0.2',
      family: 4
    })

    // Reset
    resolverEntry.address = '127.0.0.1'
  }
})

test('entry with 0 ttl', async (t) => {
  const cacheable = new DNSResolver({ resolver })

  // Make sure default behavior is right
  verify(t, await cacheable.lookupAsync('zeroTtl'), {
    address: '127.0.0.127',
    family: 4
  })

  // Update DNS data
  resolver.data['127.0.0.1'].zeroTtl[0].address = '127.0.0.1'

  // Lookup again
  verify(t, await cacheable.lookupAsync('zeroTtl'), {
    address: '127.0.0.1',
    family: 4
  })
})

test('http example', async (t) => {
  const cacheable = new DNSResolver({ resolver })

  const options = {
    hostname: 'example',
    port: 9999,
    lookup: cacheable.lookup
  }

  await t.rejects(makeRequest(options), {
    message: 'connect ECONNREFUSED 127.0.0.127:9999'
  })
})

test('.lookup() and .lookupAsync() are automatically bounded', async (t) => {
  const cacheable = new DNSResolver({ resolver })

  await t.resolves(cacheable.lookupAsync('localhost'))
  await t.resolves(promisify(cacheable.lookup)('localhost'))

  t.throws(() => cacheable.lookup('localhost'), {
    message: 'Callback must be a function.'
  })
})

test('works (Internet connection)', async (t) => {
  const cacheable = new DNSResolver()

  const { address, family } = await cacheable.lookupAsync(
    '1dot1dot1dot1.cloudflare-dns.com',
    { family: 4 }
  )
  t.equal(address === '1.1.1.1' || address === '1.0.0.1', true)
  t.equal(family, 4)
})

test('async resolver (Internet connection)', async (t) => {
  const cacheable = new DNSResolver({ resolver: new AsyncResolver() })

  const { address } = await cacheable.lookupAsync(
    '1dot1dot1dot1.cloudflare-dns.com',
    { family: 4 }
  )
  t.equal(address === '1.1.1.1' || address === '1.0.0.1', true)
})

test('clear() works', async (t) => {
  const cacheable = new DNSResolver({ resolver })

  await cacheable.lookupAsync('localhost')
  t.equal(cacheable._cache.size, 1)

  cacheable.clear()

  t.equal(cacheable._cache.size, 0)
})

test('ttl works', async (t) => {
  const cacheable = new DNSResolver({ resolver })

  await Promise.all([
    cacheable.lookupAsync('temporary'),
    cacheable.lookupAsync('ttl')
  ])
  t.equal(cacheable._cache.size, 2)

  await sleep(2001)

  t.equal(cacheable._cache.size, 0)
})

test('fallback works', async (t) => {
  const cacheable = new DNSResolver({ resolver, fallbackDuration: 0.1 })
  resolver.resetCounter()

  const entries = await cacheable.lookupAsync('osHostname', { all: true })
  t.equal(entries.length, 2)

  t.equal(entries[0].address, '127.0.0.1')
  t.equal(entries[0].family, 4)

  t.equal(entries[1].address, '127.0.0.2')
  t.equal(entries[1].family, 4)

  t.equal(cacheable._cache.size, 0)

  await cacheable.lookupAsync('osHostname', { all: true })

  t.same(resolver.counter, {
    6: 1,
    4: 1,
    lookup: 3
  })

  await sleep(100)

  t.equal(cacheable._hostnamesToFallback.size, 0)
})

test('fallback works if ip change', async (t) => {
  const cacheable = new DNSResolver({ resolver, fallbackDuration: 3600 })
  resolver.resetCounter()
  resolver.lookupData.osHostnameChange = [
    { address: '127.0.0.1', family: 4 },
    { address: '127.0.0.2', family: 4 }
  ]

  // First call: do not enter in `if (this._hostnamesToFallback.has(hostname)) {`
  const entries = await cacheable.query('osHostnameChange', { all: true })
  t.equal(entries.length, 2)

  t.equal(entries[0].address, '127.0.0.1')
  t.equal(entries[0].family, 4)

  t.equal(entries[1].address, '127.0.0.2')
  t.equal(entries[1].family, 4)

  t.equal(cacheable._cache.size, 0)

  // Second call: enter in `if (this._hostnamesToFallback.has(hostname)) {`
  // And use _dnsLookup
  // This call is used to ensure that this._pending is cleaned up when the promise is resolved
  await cacheable.query('osHostnameChange', { all: true })

  // Third call: enter in `if (this._hostnamesToFallback.has(hostname)) {`
  // And use _dnsLookup
  // Address should be different
  resolver.lookupData.osHostnameChange = [
    { address: '127.0.0.3', family: 4 },
    { address: '127.0.0.4', family: 4 }
  ]
  const entries2 = await cacheable.query('osHostnameChange', { all: true })

  t.equal(entries2.length, 2)

  t.equal(entries2[0].address, '127.0.0.3')
  t.equal(entries2[0].family, 4)

  t.equal(entries2[1].address, '127.0.0.4')
  t.equal(entries2[1].family, 4)

  t.equal(cacheable._cache.size, 0)

  delete resolver.lookupData.osHostnameChange
})

test('real DNS queries first', async (t) => {
  const resolver = createResolver({ delay: 0 })
  const cacheable = new DNSResolver({
    resolver,
    fallbackDuration: 3600,
    lookup: resolver.lookup
  })

  {
    const entries = await cacheable.lookupAsync('outdated', { all: true })
    verify(t, entries, [{ address: '127.0.0.1', family: 4 }])
  }

  await new Promise((resolve) => setTimeout(resolve, 100))

  {
    const entries = await cacheable.lookupAsync('outdated', { all: true })
    verify(t, entries, [{ address: '127.0.0.1', family: 4 }])
  }
})

test('fallback can be turned off', async (t) => {
  const cacheable = new DNSResolver({ resolver, lookup: false })

  await t.rejects(cacheable.lookupAsync('osHostname', { all: true }), {
    message: 'DNSResolver ENOTFOUND osHostname'
  })
})

test('errors are cached', async (t) => {
  const cacheable = new DNSResolver({ resolver, errorTtl: 0.1 })

  await t.rejects(cacheable.lookupAsync('doesNotExist'), {
    code: 'ENOTFOUND'
  })

  t.equal(cacheable._cache.size, 1)

  await sleep(cacheable.errorTtl * 1000 + 10)

  t.equal(cacheable._cache.size, 0)
})

test('passing family as options', async (t) => {
  const cacheable = new DNSResolver({ resolver })

  const promisified = promisify(cacheable.lookup)

  const entry = await cacheable.lookupAsync('localhost', 6)
  t.equal(entry.address, '::ffff:127.0.0.2')
  t.equal(entry.family, 6)

  const address = await promisified('localhost', 6)
  t.equal(address, '::ffff:127.0.0.2')
})

test('clear(hostname) works', async (t) => {
  const cacheable = new DNSResolver({ resolver })

  await cacheable.lookupAsync('localhost')
  await cacheable.lookupAsync('temporary')

  cacheable.clear('localhost')

  t.equal(cacheable._cache.size, 1)
})

test('prevents overloading DNS', async (t) => {
  const resolver = createResolver()
  const { lookupAsync } = new DNSResolver({
    resolver,
    lookup: resolver.lookup
  })

  await Promise.all([lookupAsync('localhost'), lookupAsync('localhost')])

  t.same(resolver.counter, {
    4: 1,
    6: 1,
    lookup: 0
  })
})

test('returns IPv6 if no other entries available', async (t) => {
  const DNSResolver = await mockedInterfaces({ has4: false, has6: true })
  const cacheable = new DNSResolver({ resolver })

  verify(t, await cacheable.lookupAsync('localhost', { hints: ADDRCONFIG }), {
    address: '::ffff:127.0.0.2',
    family: 6
  })
  await mockedInterfaces({ has4: true, has6: true })
})

test('throws when no internet connection', async (t) => {
  const cacheable = new DNSResolver({ resolver })
  await t.rejects(cacheable.lookupAsync('econnrefused'), {
    errors: [
      { code: 'ECONNREFUSED' },
      { code: 'ECONNREFUSED' }
    ]
  })
})

test('throws when the cache instance is broken', async (t) => {
  const cacheable = new DNSResolver({
    resolver,
    cache: {
      get: () => {},
      set: () => {
        throw new Error('Something broke.')
      }
    }
  })

  await t.resolves(cacheable.lookupAsync('localhost'))

  await t.rejects(cacheable.lookupAsync('localhost'), {
    message: 'Cache Error. Please recreate the DNSResolver instance.'
  })

  // not supported by this tap version
  // t.equal(error.cause.message, 'Something broke.')
})

test('slow dns.lookup', async (t) => {
  const cacheable = new DNSResolver({
    resolver,
    lookup: (hostname, options, callback) => {
      t.equal(hostname, 'osHostname')
      t.equal(options.all, true)
      t.equal(options.family === 4 || options.family === 6, true)

      setTimeout(() => {
        if (options.family === 4) {
          callback(null, [{ address: '127.0.0.1', family: 4 }])
        }

        if (options.family === 6) {
          callback(null, [{ address: '::1', family: 6 }])
        }
      }, 10)
    }
  })

  const entry = await cacheable.lookupAsync('osHostname', 4)

  t.same(entry, {
    address: '127.0.0.1',
    family: 4
  })
})

test('cache and query stats', async (t) => {
  const cacheable = new DNSResolver({ resolver })

  t.equal(cacheable.stats.query, 0)
  t.equal(cacheable.stats.cache, 0)

  let entries = await cacheable.lookupAsync('temporary', {
    all: true,
    family: 4
  })
  verify(t, entries, [{ address: '127.0.0.1', family: 4 }])

  t.equal(cacheable.stats.query, 1)
  t.equal(cacheable.stats.cache, 0)

  entries = await cacheable.lookupAsync('temporary', { all: true, family: 4 })

  verify(t, entries, [{ address: '127.0.0.1', family: 4 }])

  t.equal(cacheable.stats.query, 1)
  t.equal(cacheable.stats.cache, 1)
})

test('verify DNSResolver is working caching requests', t => {
  t.plan(2)
  const { Agent, request } = require('../index')
  const dnsResolver = new DNSResolver({ resolver: createResolver() })
  dnsResolver.clear()
  const agent = new Agent({
    DNSResolver: dnsResolver
  })
  t.equal(dnsResolver._cache.size, 0)

  const server = http.createServer((req, res) => {
    req.pipe(res)
  })

  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const origin = `http://agentdns:${server.address().port}`
    await request(origin, { dispatcher: agent })
    t.equal(dnsResolver._cache.size, 1)
    t.end()
  })
})
