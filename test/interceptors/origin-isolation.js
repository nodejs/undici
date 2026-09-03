'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const {
  Agent,
  BalancedPool,
  Client,
  Dispatcher1Wrapper,
  Pool,
  RetryAgent,
  cacheStores,
  interceptors
} = require('../../')
const { makeCacheKey } = require('../../lib/util/cache')

const dispatcherFactories = [
  { name: 'Client', create: origin => new Client(origin), originless: false },
  { name: 'Pool', create: origin => new Pool(origin), originless: false },
  { name: 'BalancedPool', create: origin => new BalancedPool(origin), originless: true },
  {
    name: 'RetryAgent(BalancedPool)',
    create: origin => new RetryAgent(new BalancedPool(origin)),
    originless: true
  },
  {
    name: 'Dispatcher1Wrapper(BalancedPool)',
    create: origin => new Dispatcher1Wrapper(new BalancedPool(origin)),
    originless: true
  }
]

const boundDispatcherFactories = [
  { name: 'Client', create: origin => new Client(origin) },
  { name: 'Pool', create: origin => new Pool(origin) },
  { name: 'RetryAgent(Client)', create: origin => new RetryAgent(new Client(origin)) },
  {
    name: 'Dispatcher1Wrapper(Client)',
    create: origin => new Dispatcher1Wrapper(new Client(origin))
  }
]

function listen (server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
}

function close (server) {
  return new Promise(resolve => server.close(resolve))
}

async function createOrigins () {
  const hits = { A: 0, B: 0 }
  let notifyA
  let releaseA
  const aRequested = new Promise(resolve => {
    notifyA = resolve
  })
  const aReleased = new Promise(resolve => {
    releaseA = resolve
  })

  const createOrigin = label => createServer(async (req, res) => {
    hits[label]++

    if (label === 'A' && req.url === '/deduplicate') {
      notifyA()
      await aReleased
    }

    res.writeHead(200, {
      'cache-control': 'public, max-age=300',
      'x-origin': label
    })
    res.end(label)
  })

  const serverA = createOrigin('A')
  const serverB = createOrigin('B')
  await Promise.all([listen(serverA), listen(serverB)])

  return {
    aRequested,
    releaseA,
    hits,
    originA: `http://127.0.0.1:${serverA.address().port}`,
    originB: `http://127.0.0.1:${serverB.address().port}`,
    close: () => Promise.all([close(serverA), close(serverB)])
  }
}

async function get (dispatcher, path, opts = {}) {
  const { headers, body } = await dispatcher.request({
    method: 'GET',
    path,
    ...opts
  })
  return {
    origin: headers['x-origin'],
    body: await body.text()
  }
}

async function closeResources (dispatchers, origins) {
  origins.releaseA()
  await Promise.all(dispatchers.map(dispatcher => dispatcher.close()))
  await origins.close()
}

for (const reuseInterceptor of [false, true]) {
  test(`cache isolates origins with ${reuseInterceptor ? 'one reused interceptor' : 'separate interceptors sharing a store'}`, async t => {
    for (const { name, create, originless } of dispatcherFactories) {
      await t.test(name, async t => {
        const origins = await createOrigins()
        let interceptorA
        let interceptorB

        if (reuseInterceptor) {
          interceptorA = interceptorB = interceptors.cache()
        } else {
          const store = new cacheStores.MemoryCacheStore()
          interceptorA = interceptors.cache({ store })
          interceptorB = interceptors.cache({ store })
        }

        const baseDispatcherA = create(origins.originA)
        const baseDispatcherB = create(origins.originB)
        const dispatcherA = baseDispatcherA.compose(interceptorA)
        const dispatcherB = baseDispatcherB.compose(interceptorB)
        t.after(() => closeResources([baseDispatcherA, baseDispatcherB], origins))

        const requestOpts = reuseInterceptor && originless
          ? { origin: 'http://shared.example' }
          : {}
        const results = [
          await get(dispatcherA, '/cache', requestOpts),
          await get(dispatcherA, '/cache', requestOpts),
          await get(dispatcherB, '/cache', requestOpts),
          await get(dispatcherB, '/cache', requestOpts)
        ]

        t.assert.deepStrictEqual(results.map(({ origin }) => origin), ['A', 'A', 'B', 'B'])
        t.assert.deepStrictEqual(results.map(({ body }) => body), ['A', 'A', 'B', 'B'])

        const expectedHits = originless
          ? { A: 2, B: 2 }
          : { A: 1, B: 1 }
        t.assert.deepStrictEqual(origins.hits, expectedHits)
      })
    }
  })
}

test('deduplicate isolates origins with one reused interceptor', { timeout: 5000 }, async t => {
  for (const { name, create, originless } of dispatcherFactories) {
    await t.test(name, async t => {
      const origins = await createOrigins()
      const deduplicate = interceptors.deduplicate()
      const baseDispatcherA = create(origins.originA)
      const baseDispatcherB = create(origins.originB)
      const dispatcherA = baseDispatcherA.compose(deduplicate)
      const dispatcherB = baseDispatcherB.compose(deduplicate)
      t.after(() => closeResources([baseDispatcherA, baseDispatcherB], origins))

      const requestOpts = originless
        ? { origin: 'http://shared.example' }
        : {}
      const responseA = get(dispatcherA, '/deduplicate', requestOpts)
      await origins.aRequested
      const responseB = get(dispatcherB, '/deduplicate', requestOpts)
      origins.releaseA()

      t.assert.deepStrictEqual(await Promise.all([responseA, responseB]), [
        { origin: 'A', body: 'A' },
        { origin: 'B', body: 'B' }
      ])
      t.assert.deepStrictEqual(origins.hits, { A: 1, B: 1 })
    })
  }
})

test('DNS resolution does not replace the cache origin', async t => {
  const hits = { attacker: 0, trusted: 0 }
  const server = createServer((req, res) => {
    const source = req.headers.host.startsWith('attacker.')
      ? 'attacker'
      : 'trusted'
    hits[source]++
    res.writeHead(200, {
      'cache-control': 'public, max-age=300',
      'x-origin': source
    })
    res.end(source)
  })
  await listen(server)

  const port = server.address().port
  const dispatcher = new Agent().compose(
    interceptors.cache(),
    interceptors.dns({
      lookup: (_origin, _opts, callback) => {
        callback(null, [{ address: '127.0.0.1', family: 4 }])
      }
    })
  )
  t.after(async () => {
    await dispatcher.close()
    await close(server)
  })

  const attacker = await get(dispatcher, '/dns-cache', {
    origin: `http://attacker.example:${port}`
  })
  const trusted = await get(dispatcher, '/dns-cache', {
    origin: `http://trusted.example:${port}`
  })

  t.assert.deepStrictEqual([attacker, trusted], [
    { origin: 'attacker', body: 'attacker' },
    { origin: 'trusted', body: 'trusted' }
  ])
  t.assert.deepStrictEqual(hits, { attacker: 1, trusted: 1 })
})

test('DNS fallback preserves the cache origin', async t => {
  const hits = { attacker: 0, trusted: 0 }
  const server = createServer((req, res) => {
    const source = req.headers.host.startsWith('attacker.')
      ? 'attacker'
      : 'trusted'
    hits[source]++
    res.writeHead(200, {
      'cache-control': 'public, max-age=300',
      'x-origin': source
    })
    res.end(source)
  })
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '::1', resolve)
    })
  } catch {
    t.skip('IPv6 is unavailable')
    return
  }

  const unavailableServer = createServer()
  await listen(unavailableServer)
  const unavailablePort = unavailableServer.address().port
  await close(unavailableServer)

  const dispatcher = new Agent().compose(
    interceptors.cache(),
    interceptors.dns({
      affinity: 4,
      lookup: (_origin, _opts, callback) => {
        callback(null, [
          { address: '127.0.0.1', port: unavailablePort, family: 4 },
          { address: '::1', port: server.address().port, family: 6 }
        ])
      }
    })
  )
  t.after(async () => {
    await dispatcher.close()
    await close(server)
  })

  const results = [
    await get(dispatcher, '/fallback', { origin: 'http://attacker.example' }),
    await get(dispatcher, '/fallback', { origin: 'http://trusted.example' })
  ]
  t.assert.deepStrictEqual(results, [
    { origin: 'attacker', body: 'attacker' },
    { origin: 'trusted', body: 'trusted' }
  ])
  t.assert.deepStrictEqual(hits, { attacker: 1, trusted: 1 })
})

test('bound dispatchers bypass origin-dependent interceptors for DNS virtual hosts', { timeout: 10000 }, async t => {
  for (const { name, create } of boundDispatcherFactories.slice(0, 2)) {
    for (const type of ['cache', 'deduplicate']) {
      for (const order of ['dns-first', 'dns-last']) {
        await t.test(`${name}: ${type}, ${order}`, async t => {
          const hits = { attacker: 0, trusted: 0 }
          let notifyAttacker
          let releaseAttacker
          const attackerRequested = new Promise(resolve => {
            notifyAttacker = resolve
          })
          const attackerReleased = new Promise(resolve => {
            releaseAttacker = resolve
          })
          const server = createServer(async (req, res) => {
            const source = req.headers.host.startsWith('attacker.')
              ? 'attacker'
              : 'trusted'
            hits[source]++
            if (source === 'attacker' && req.url === '/deduplicate') {
              notifyAttacker()
              await attackerReleased
            }
            res.writeHead(200, {
              'cache-control': 'public, max-age=300',
              'x-origin': source
            })
            res.end(source)
          })
          await listen(server)

          const origin = `http://127.0.0.1:${server.address().port}`
          const dns = interceptors.dns({
            lookup: (_origin, _opts, callback) => {
              callback(null, [{ address: '127.0.0.1', family: 4 }])
            }
          })
          const originInterceptor = type === 'cache'
            ? interceptors.cache()
            : interceptors.deduplicate()
          const baseDispatcher = create(origin)
          const dispatcher = order === 'dns-first'
            ? baseDispatcher.compose(dns, originInterceptor)
            : baseDispatcher.compose(originInterceptor, dns)
          t.after(async () => {
            releaseAttacker()
            await baseDispatcher.close()
            await close(server)
          })

          const attackerOpts = { origin: `http://attacker.example:${server.address().port}` }
          const trustedOpts = { origin: `http://trusted.example:${server.address().port}` }
          if (type === 'cache') {
            const results = [
              await get(dispatcher, '/cache', attackerOpts),
              await get(dispatcher, '/cache', attackerOpts),
              await get(dispatcher, '/cache', trustedOpts),
              await get(dispatcher, '/cache', trustedOpts)
            ]
            t.assert.deepStrictEqual(results.map(({ origin }) => origin), [
              'attacker', 'attacker', 'trusted', 'trusted'
            ])
            t.assert.deepStrictEqual(hits, { attacker: 2, trusted: 2 })
          } else {
            const attacker = get(dispatcher, '/deduplicate', attackerOpts)
            await attackerRequested
            const trusted = get(dispatcher, '/deduplicate', trustedOpts)
            releaseAttacker()
            t.assert.deepStrictEqual(await Promise.all([attacker, trusted]), [
              { origin: 'attacker', body: 'attacker' },
              { origin: 'trusted', body: 'trusted' }
            ])
            t.assert.deepStrictEqual(hits, { attacker: 1, trusted: 1 })
          }
        })
      }
    }
  }
})

test('redirects update the cache origin', async t => {
  let hitsB = 0
  const serverB = createServer((_req, res) => {
    hitsB++
    res.writeHead(200, {
      'cache-control': 'public, max-age=300',
      'x-origin': 'B'
    })
    res.end('B')
  })
  const serverA = createServer((_req, res) => {
    res.writeHead(302, {
      location: `http://127.0.0.1:${serverB.address().port}/final`
    })
    res.end()
  })
  await Promise.all([listen(serverA), listen(serverB)])

  const dispatcher = new Agent().compose(
    interceptors.cache(),
    interceptors.redirect({ maxRedirections: 1 })
  )
  t.after(async () => {
    await dispatcher.close()
    await Promise.all([close(serverA), close(serverB)])
  })

  const originA = `http://127.0.0.1:${serverA.address().port}`
  const originB = `http://127.0.0.1:${serverB.address().port}`
  t.assert.deepStrictEqual(await get(dispatcher, '/redirect', { origin: originA }), {
    origin: 'B',
    body: 'B'
  })
  t.assert.deepStrictEqual(await get(dispatcher, '/final', { origin: originB }), {
    origin: 'B',
    body: 'B'
  })
  t.assert.strictEqual(hitsB, 1)
})

test('bound dispatchers ignore a caller-provided cache origin', async t => {
  for (const { name, create } of boundDispatcherFactories) {
    await t.test(name, async t => {
      const origins = await createOrigins()
      const store = new cacheStores.MemoryCacheStore()
      const baseDispatcherA = create(origins.originA)
      const baseDispatcherB = create(origins.originB)
      const dispatcherA = baseDispatcherA.compose(interceptors.cache({ store }))
      const dispatcherB = baseDispatcherB.compose(interceptors.cache({ store }))
      t.after(() => closeResources([baseDispatcherA, baseDispatcherB], origins))

      const responseA = await get(dispatcherA, '/caller-origin', {
        origin: origins.originB
      })
      const responseB = await get(dispatcherB, '/caller-origin')

      t.assert.deepStrictEqual([responseA, responseB], [
        { origin: 'A', body: 'A' },
        { origin: 'B', body: 'B' }
      ])
      t.assert.deepStrictEqual(origins.hits, { A: 1, B: 1 })
    })
  }
})

test('cache keys require a valid origin', t => {
  for (const origin of [undefined, null, false, 0, {}]) {
    t.assert.throws(
      () => makeCacheKey({ origin, method: 'GET', path: '/' }),
      { message: 'opts.origin is undefined' }
    )
  }
})
