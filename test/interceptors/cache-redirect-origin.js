'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { setTimeout: sleep } = require('node:timers/promises')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { rm } = require('node:fs/promises')
const {
  Agent,
  Pool,
  cacheStores,
  interceptors
} = require('../../')
const { runtimeFeatures } = require('../../lib/util/runtime-features.js')

/**
 * Reproduces GHSA-4W7W-5XRC-9H26: when a shared cache is placed outside the
 * redirect interceptor (`compose(redirect(), cache())`), the cache keys the
 * response on the original (trusted) origin before the redirect handler
 * changes the origin. The cross-origin response is then stored under the
 * trusted key, so a later request to the trusted URL receives attacker bytes
 * even though it never hit either origin.
 *
 * The fix verifies, before storing, that the effective request origin matches
 * the cache key origin. See lib/handler/cache-handler.js.
 */

async function listen (server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
}

async function closeServer (server) {
  server.close()
  await once(server, 'close')
}

async function withOrigins (run) {
  const state = {
    redirectEnabled: true,
    trustedHits: 0,
    attackerHits: 0
  }

  const attacker = createServer((_req, res) => {
    state.attackerHits++
    res.writeHead(200, {
      'cache-control': 'public, max-age=86400',
      'content-type': 'text/plain'
    })
    res.end('attacker-controlled-content')
  })

  const trusted = createServer((req, res) => {
    state.trustedHits++
    if (state.redirectEnabled && req.url === '/resource') {
      res.writeHead(302, {
        location: `http://127.0.0.1:${attacker.address().port}/payload`
      })
      res.end()
      return
    }
    res.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'text/plain'
    })
    res.end('legitimate-content')
  })

  await Promise.all([listen(trusted), listen(attacker)])

  const trustedOrigin = `http://127.0.0.1:${trusted.address().port}`
  try {
    return await run({ state, trustedOrigin })
  } finally {
    await Promise.all([closeServer(trusted), closeServer(attacker)])
  }
}

async function requestAgent (agent, origin, user) {
  const response = await agent.request({
    origin,
    path: '/resource',
    method: 'GET',
    headers: { cookie: `session=${user}` }
  })
  return response.body.text()
}

test('cache does not store a cross-origin redirect response under the original origin key (memory)', async () => {
  await withOrigins(async ({ state, trustedOrigin }) => {
    const agent = new Agent().compose(
      interceptors.redirect({ maxRedirections: 2 }),
      interceptors.cache({
        store: new cacheStores.MemoryCacheStore(),
        type: 'shared'
      })
    )

    const mallory = await requestAgent(agent, trustedOrigin, 'mallory')
    state.redirectEnabled = false
    const hitsBeforeAlice = [state.trustedHits, state.attackerHits]
    const alice = await requestAgent(agent, trustedOrigin, 'alice')
    const hitsAfterAlice = [state.trustedHits, state.attackerHits]

    try {
      assert.equal(mallory, 'attacker-controlled-content')
      // Alice must receive the legitimate origin's response, not the poisoned
      // attacker bytes. A cache hit on a poisoned entry would serve
      // 'attacker-controlled-content' without contacting the trusted origin.
      assert.equal(alice, 'legitimate-content')
      // The trusted origin must have actually been contacted for Alice's
      // request, proving the poisoned entry was not served.
      assert.notDeepEqual(hitsAfterAlice, hitsBeforeAlice)
    } finally {
      await agent.close()
    }
  })
})

test('cache does not store a cross-origin redirect response under the original origin key (sqlite persistence)', { skip: runtimeFeatures.has('sqlite') === false }, async () => {
  const database = join(tmpdir(), `undici-cache-redirect-origin-${process.pid}.sqlite`)
  try {
    await withOrigins(async ({ state, trustedOrigin }) => {
      const firstStore = new cacheStores.SqliteCacheStore({ location: database })
      const firstAgent = new Agent().compose(
        interceptors.redirect({ maxRedirections: 2 }),
        interceptors.cache({ store: firstStore, type: 'shared' })
      )
      const mallory = await requestAgent(firstAgent, trustedOrigin, 'mallory')
      await firstAgent.close()
      firstStore.close()

      state.redirectEnabled = false
      const hitsBeforeAlice = [state.trustedHits, state.attackerHits]
      const reopenedStore = new cacheStores.SqliteCacheStore({ location: database })
      const secondAgent = new Agent().compose(
        interceptors.redirect({ maxRedirections: 2 }),
        interceptors.cache({ store: reopenedStore, type: 'shared' })
      )
      const alice = await requestAgent(secondAgent, trustedOrigin, 'alice')
      const hitsAfterAlice = [state.trustedHits, state.attackerHits]
      await secondAgent.close()
      reopenedStore.close()

      assert.equal(mallory, 'attacker-controlled-content')
      assert.equal(alice, 'legitimate-content')
      assert.notDeepEqual(hitsAfterAlice, hitsBeforeAlice)
    })
  } finally {
    await rm(database, { force: true })
  }
})

test('reverse interceptor order (cache outside redirect) still works', async () => {
  await withOrigins(async ({ state, trustedOrigin }) => {
    const agent = new Agent().compose(
      interceptors.cache({
        store: new cacheStores.MemoryCacheStore(),
        type: 'shared'
      }),
      interceptors.redirect({ maxRedirections: 2 })
    )

    const mallory = await requestAgent(agent, trustedOrigin, 'mallory')
    state.redirectEnabled = false
    const alice = await requestAgent(agent, trustedOrigin, 'alice')

    try {
      assert.equal(mallory, 'attacker-controlled-content')
      assert.equal(alice, 'legitimate-content')
      assert.equal(state.trustedHits, 2)
      assert.equal(state.attackerHits, 1)
    } finally {
      await agent.close()
    }
  })
})

test('same-origin redirect responses are still cached by the cache interceptor', async () => {
  const state = { redirectEnabled: true, targetHits: 0 }
  const server = createServer((req, res) => {
    if (state.redirectEnabled && req.url === '/resource') {
      res.writeHead(301, {
        location: '/target',
        'cache-control': 'public, max-age=60'
      })
      res.end()
      return
    }
    state.targetHits++
    res.writeHead(200, {
      'cache-control': 'public, max-age=86400',
      'content-type': 'text/plain'
    })
    res.end('same-origin-content')
  })
  await listen(server)
  const origin = `http://127.0.0.1:${server.address().port}`

  const agent = new Agent().compose(
    interceptors.redirect({ maxRedirections: 2 }),
    interceptors.cache({
      store: new cacheStores.MemoryCacheStore(),
      type: 'shared'
    })
  )

  try {
    const first = await agent.request({ origin, path: '/resource', method: 'GET' })
      .then(response => response.body.text())
    // Disable the redirect then request the original URL again: the response
    // should be served from the cache, proving a same-origin redirect was not
    // incorrectly rejected by the cross-origin origin check.
    state.redirectEnabled = false
    const hitsBefore = state.targetHits
    const second = await agent.request({ origin, path: '/resource', method: 'GET' })
      .then(response => response.body.text())

    assert.equal(first, 'same-origin-content')
    assert.equal(second, 'same-origin-content')
    // Second request must be a cache hit (the /target origin was not re-hit).
    assert.equal(state.targetHits, hitsBefore)
  } finally {
    await agent.close()
    await closeServer(server)
  }
})

test('origin-bound Pool cannot be poisoned by a cross-origin redirect', async () => {
  await withOrigins(async ({ state, trustedOrigin }) => {
    const pool = new Pool(trustedOrigin).compose(
      interceptors.redirect({ maxRedirections: 2 }),
      interceptors.cache({
        store: new cacheStores.MemoryCacheStore(),
        type: 'shared'
      })
    )

    const first = await pool.request({ path: '/resource', method: 'GET' })
      .then(response => response.body.text())
    state.redirectEnabled = false
    const second = await pool.request({ path: '/resource', method: 'GET' })
      .then(response => response.body.text())

    try {
      assert.equal(first, 'legitimate-content')
      assert.equal(second, 'legitimate-content')
      // An origin-bound dispatcher must not be able to reach the attacker origin.
      assert.equal(state.attackerHits, 0)
    } finally {
      await pool.close()
    }
  })
})

// A redirect response must only be reused for a request that could itself
// reach it. Matching the cache-key origin is not sufficient: when the original
// hop is `private, no-store` and redirects to a different resource on the same
// origin, the final body must not be stored under the original request's key,
// otherwise a later caller that is not entitled to the redirect (here an
// unauthenticated one) is served the private body from the shared cache.
test('cache does not store a same-origin redirect response under the original path key', async () => {
  const state = { authEnabled: true, objectHits: 0 }

  const server = createServer((req, res) => {
    if (req.url === '/account') {
      if (state.authEnabled && req.headers.authorization) {
        res.writeHead(302, {
          'cache-control': 'private, no-store',
          location: '/signed-object?token=alice'
        })
        res.end()
        return
      }
      res.writeHead(403, { 'cache-control': 'no-store' })
      res.end('denied')
      return
    }

    if (req.url.startsWith('/signed-object')) {
      state.objectHits++
      res.writeHead(200, {
        'cache-control': 'public, max-age=86400',
        'content-type': 'text/plain'
      })
      res.end('alice-private-object')
      return
    }

    res.writeHead(404)
    res.end('not found')
  })

  await listen(server)
  const origin = `http://127.0.0.1:${server.address().port}`

  const agent = new Agent().compose(
    interceptors.redirect({ maxRedirections: 2 }),
    interceptors.cache({
      store: new cacheStores.MemoryCacheStore(),
      type: 'shared'
    })
  )

  try {
    const authed = await agent.request({
      origin,
      path: '/account',
      method: 'GET',
      headers: { authorization: 'Bearer alice' }
    }).then(response => response.body.text())
    assert.equal(authed, 'alice-private-object')

    state.authEnabled = false
    const anon = await agent.request({
      origin,
      path: '/account',
      method: 'GET'
    }).then(response => response.body.text())

    // The unauthenticated caller must not receive the private object from the
    // cache. With the request no longer authenticated the account endpoint
    // denies it; a poisoned cache entry would instead return the private body.
    assert.notEqual(anon, 'alice-private-object')
    assert.equal(anon, 'denied')
  } finally {
    await agent.close()
    await closeServer(server)
  }
})

// The guard against caching a cross-origin redirect response must hold for any
// composition, not only `compose(redirect(), cache())`. The cache must learn
// the final origin without depending on a shared mutable options object, since
// an interceptor between the cache and the redirect (here `deduplicate`) may
// hand the redirect a copy, so composing one must not reopen cross-origin
// cache poisoning.
test('cache does not store a cross-origin redirect response when a copying interceptor sits between cache and redirect', async () => {
  await withOrigins(async ({ state, trustedOrigin }) => {
    const agent = new Agent().compose(
      interceptors.redirect({ maxRedirections: 2 }),
      interceptors.deduplicate(),
      interceptors.cache({
        store: new cacheStores.MemoryCacheStore(),
        type: 'shared'
      })
    )

    const mallory = await requestAgent(agent, trustedOrigin, 'mallory')
    state.redirectEnabled = false
    const hitsBeforeAlice = [state.trustedHits, state.attackerHits]
    const alice = await requestAgent(agent, trustedOrigin, 'alice')
    const hitsAfterAlice = [state.trustedHits, state.attackerHits]

    try {
      assert.equal(mallory, 'attacker-controlled-content')
      // Alice must receive the legitimate origin's response, not the poisoned
      // attacker bytes, and the trusted origin must be contacted again.
      assert.equal(alice, 'legitimate-content')
      assert.notDeepEqual(hitsAfterAlice, hitsBeforeAlice)
    } finally {
      await agent.close()
    }
  })
})

for (const redirectType of ['same-origin', 'cross-origin']) {
  test(`a ${redirectType} 304 after a redirect cannot validate the original cached response`, async () => {
    const targetValidators = []
    let targetOrigin

    const target = redirectType === 'cross-origin'
      ? createServer((req, res) => {
        const validator = req.headers['if-none-match']
        targetValidators.push(validator)
        if (validator) {
          res.writeHead(304, { etag: '"trusted-private"' })
        } else {
          res.writeHead(200, { 'cache-control': 'no-store' })
          res.write('target-response')
        }
        res.end()
      })
      : undefined

    if (target) {
      await listen(target)
      targetOrigin = `http://127.0.0.1:${target.address().port}`
    }

    const trusted = createServer((req, res) => {
      if (req.url === '/resource' && req.headers.authorization === 'Bearer alice') {
        res.writeHead(200, {
          'cache-control': 'must-revalidate, max-age=0',
          etag: '"trusted-private"'
        })
        res.end('alice-private-response')
        return
      }

      if (req.url === '/resource') {
        res.writeHead(302, {
          'cache-control': 'private, no-store',
          location: redirectType === 'cross-origin' ? `${targetOrigin}/validate` : '/validate'
        })
        res.end()
        return
      }

      const validator = req.headers['if-none-match']
      targetValidators.push(validator)
      if (validator) {
        res.writeHead(304, { etag: '"trusted-private"' })
      } else {
        res.writeHead(200, { 'cache-control': 'no-store' })
        res.write('target-response')
      }
      res.end()
    })

    await listen(trusted)
    const trustedOrigin = `http://127.0.0.1:${trusted.address().port}`
    const agent = new Agent().compose(
      interceptors.redirect({ maxRedirections: 2 }),
      interceptors.cache({
        store: new cacheStores.MemoryCacheStore(),
        type: 'shared'
      })
    )

    try {
      const prime = await agent.request({
        origin: trustedOrigin,
        path: '/resource',
        method: 'GET',
        headers: { authorization: 'Bearer alice' }
      })
      assert.equal(await prime.body.text(), 'alice-private-response')

      const revalidated = await agent.request({
        origin: trustedOrigin,
        path: '/resource',
        method: 'GET'
      })

      assert.equal(revalidated.statusCode, 200)
      assert.equal(await revalidated.body.text(), 'target-response')
      assert.deepEqual(targetValidators, ['"trusted-private"', undefined])
    } finally {
      await agent.close()
      await closeServer(trusted)
      if (target) {
        await closeServer(target)
      }
    }
  })
}

test('a mismatched strong ETag cannot validate a cached response', async () => {
  const validators = []
  const server = createServer((req, res) => {
    if (req.headers.authorization === 'Bearer alice') {
      res.writeHead(200, {
        'cache-control': 'must-revalidate, max-age=0',
        etag: '"trusted-private"'
      })
      res.end('alice-private-response')
      return
    }

    const validator = req.headers['if-none-match']
    validators.push(validator)
    if (validator) {
      res.writeHead(304, { etag: '"mismatched"' })
    } else {
      res.writeHead(200, { 'cache-control': 'no-store' })
      res.write('replacement-response')
    }
    res.end()
  })

  await listen(server)
  const origin = `http://127.0.0.1:${server.address().port}`
  const agent = new Agent().compose(interceptors.cache({
    store: new cacheStores.MemoryCacheStore(),
    type: 'shared'
  }))

  try {
    const prime = await agent.request({
      origin,
      path: '/resource',
      method: 'GET',
      headers: { authorization: 'Bearer alice' }
    })
    assert.equal(await prime.body.text(), 'alice-private-response')

    const revalidated = await agent.request({
      origin,
      path: '/resource',
      method: 'GET'
    })

    assert.equal(revalidated.statusCode, 200)
    assert.equal(await revalidated.body.text(), 'replacement-response')
    assert.deepEqual(validators, ['"trusted-private"', undefined])
  } finally {
    await agent.close()
    await closeServer(server)
  }
})

// Deduplicated requests that join an in-flight request before it starts receive
// the response through a separate replay path. That path must still carry the
// redirect history, otherwise a joined request caches a cross-origin redirect
// response under the original key while the primary request correctly rejects
// it.
test('cache does not store a cross-origin redirect response for a deduplicated concurrent request', async () => {
  const state = { redirectEnabled: true, attackerHits: 0 }

  const attacker = createServer((_req, res) => {
    state.attackerHits++
    res.writeHead(200, {
      'cache-control': 'public, max-age=86400',
      'content-type': 'text/plain'
    })
    res.end('attacker-controlled-content')
  })

  const trusted = createServer((req, res) => {
    if (state.redirectEnabled && req.url === '/resource') {
      // Delay the redirect so both concurrent requests are in-flight together
      // and the second is deduplicated onto the first.
      setTimeout(() => {
        res.writeHead(302, {
          location: `http://127.0.0.1:${attacker.address().port}/payload`
        })
        res.end()
      }, 50)
      return
    }
    res.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'text/plain'
    })
    res.end('legitimate-content')
  })

  await Promise.all([listen(trusted), listen(attacker)])
  const trustedOrigin = `http://127.0.0.1:${trusted.address().port}`

  const agent = new Agent().compose(
    interceptors.redirect({ maxRedirections: 2 }),
    interceptors.deduplicate(),
    interceptors.cache({
      store: new cacheStores.MemoryCacheStore(),
      type: 'shared'
    })
  )

  try {
    const request = () => agent
      .request({ origin: trustedOrigin, path: '/resource', method: 'GET' })
      .then(response => response.body.text())

    const [first, second] = await Promise.all([request(), request()])
    state.redirectEnabled = false
    const third = await request()

    assert.equal(first, 'attacker-controlled-content')
    assert.equal(second, 'attacker-controlled-content')
    // The entry must not have been poisoned by either the primary or the
    // deduplicated request, so a later caller reaches the trusted origin.
    assert.equal(third, 'legitimate-content')
  } finally {
    await agent.close()
    await Promise.all([closeServer(trusted), closeServer(attacker)])
  }
})

// GHSA-MQG3-3V4R-CM32, primitive 1: a redirect that bounces through an
// untrusted intermediate origin and lands back on the trusted origin must not
// be cached under the trusted origin's key. The final response origin matches
// the original key, but an intermediate hop crossed the trust boundary, so the
// attacker-controlled intermediate can bounce to any cacheable asset on the
// trusted origin and poison the original URL.
test('cache does not store a cross-origin bounce redirect under the original origin key', async () => {
  const state = {
    redirectEnabled: true,
    trustedHits: 0,
    attackerHits: 0
  }

  const attacker = createServer((_req, res) => {
    state.attackerHits++
    res.writeHead(302, {
      location: `http://127.0.0.1:${trusted.address().port}/uploads/mallory-controlled.json`
    })
    res.end()
  })

  const trusted = createServer((req, res) => {
    state.trustedHits++
    if (state.redirectEnabled && req.url === '/resource') {
      res.writeHead(302, {
        location: `http://127.0.0.1:${attacker.address().port}/bounce`
      })
      res.end()
      return
    }
    if (req.url === '/uploads/mallory-controlled.json') {
      res.writeHead(200, {
        'cache-control': 'public, max-age=86400',
        'content-type': 'text/plain'
      })
      res.end('poisoned-attacker-bytes')
      return
    }
    res.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'text/plain'
    })
    res.end('legitimate-content')
  })

  await Promise.all([listen(trusted), listen(attacker)])
  const trustedOrigin = `http://127.0.0.1:${trusted.address().port}`

  const agent = new Agent().compose(
    interceptors.redirect({ maxRedirections: 3 }),
    interceptors.cache({
      store: new cacheStores.MemoryCacheStore(),
      type: 'shared'
    })
  )

  try {
    const mallory = await agent.request({ origin: trustedOrigin, path: '/resource', method: 'GET' })
      .then(response => response.body.text())
    assert.equal(mallory, 'poisoned-attacker-bytes')

    state.redirectEnabled = false
    const hitsBefore = [state.trustedHits, state.attackerHits]
    const victim = await agent.request({ origin: trustedOrigin, path: '/resource', method: 'GET' })
      .then(response => response.body.text())

    // The bounced, attacker-influenced response must not have been stored under
    // the trusted key, so the later request reaches the trusted origin again.
    assert.equal(victim, 'legitimate-content')
    assert.notDeepEqual([state.trustedHits, state.attackerHits], hitsBefore)
  } finally {
    await agent.close()
    await Promise.all([closeServer(trusted), closeServer(attacker)])
  }
})

// GHSA-MQG3-3V4R-CM32, primitive 2 & 3: a same-origin hop that carries `Vary: *`
// (RFC 9111 §4.1) or that must be revalidated before use (`no-cache`/`must-revalidate`)
// must not be folded into a cacheable final response under the original key. Here an
// authenticated `/account` redirects to a credential-less public blob and would
// otherwise leak Alice's response to anonymous callers.
for (const hopHeaders of [
  { vary: '*', 'cache-control': 'no-cache, max-age=0, s-maxage=0, must-revalidate' },
  { vary: '*', 'cache-control': 'public, max-age=3600' },
  { 'cache-control': 'no-cache, max-age=0, s-maxage=0, must-revalidate' },
  { 'cache-control': 'private, no-store' },
  { 'cache-control': 'public, max-age=3600, private="location"' }
]) {
  test(`cache does not store a redirect response whose hop has restrictive directives (${JSON.stringify(hopHeaders)})`, async () => {
    const state = { authEnabled: true, objectHits: 0 }
    const server = createServer((req, res) => {
      if (req.url === '/account') {
        if (state.authEnabled && req.headers.authorization === 'Bearer alice') {
          res.writeHead(302, {
            ...hopHeaders,
            location: '/signed-object?token=alice'
          })
          res.end()
          return
        }
        res.writeHead(403, { 'cache-control': 'no-store' })
        res.end('denied')
        return
      }
      if (req.url.startsWith('/signed-object')) {
        state.objectHits++
        res.writeHead(200, {
          'cache-control': 'public, max-age=86400',
          'content-type': 'text/plain'
        })
        res.end('alice-private-object')
        return
      }
      res.writeHead(404)
      res.end('not found')
    })

    await listen(server)
    const origin = `http://127.0.0.1:${server.address().port}`

    const agent = new Agent().compose(
      interceptors.redirect({ maxRedirections: 2 }),
      interceptors.cache({
        store: new cacheStores.MemoryCacheStore(),
        type: 'shared'
      })
    )

    try {
      const authed = await agent.request({
        origin,
        path: '/account',
        method: 'GET',
        headers: { authorization: 'Bearer alice' }
      }).then(response => response.body.text())
      assert.equal(authed, 'alice-private-object')

      state.authEnabled = false
      const anon = await agent.request({
        origin,
        path: '/account',
        method: 'GET'
      }).then(response => response.body.text())

      // The private object must not be served from the cache to an anonymous
      // caller; the account endpoint now denies it.
      assert.equal(anon, 'denied')
      assert.notEqual(anon, 'alice-private-object')
    } finally {
      await agent.close()
      await closeServer(server)
    }
  })
}

// GHSA-MQG3-3V4R-CM32, primitive 2 (union): a hop that selects its target on an
// authenticated header (`Vary: Authorization`) must make the stored entry vary on
// that header. Otherwise Alice's response is served to a caller with a different
// (or no) Authorization.
test('cache unions a redirect hop Vary header into the stored entry', async () => {
  const state = { authEnabled: true, objectHits: 0 }
  const server = createServer((req, res) => {
    if (req.url === '/account') {
      if (state.authEnabled && req.headers.authorization === 'Bearer alice') {
        res.writeHead(302, {
          vary: 'authorization',
          'cache-control': 'public, max-age=3600',
          location: '/signed-object?token=alice'
        })
        res.end()
        return
      }
      res.writeHead(403, { 'cache-control': 'no-store' })
      res.end('denied')
      return
    }
    if (req.url.startsWith('/signed-object')) {
      state.objectHits++
      res.writeHead(200, {
        'cache-control': 'public, max-age=86400',
        'content-type': 'text/plain'
      })
      res.end('alice-private-object')
      return
    }
    res.writeHead(404)
    res.end('not found')
  })

  await listen(server)
  const origin = `http://127.0.0.1:${server.address().port}`

  const agent = new Agent().compose(
    interceptors.redirect({ maxRedirections: 2 }),
    interceptors.cache({
      store: new cacheStores.MemoryCacheStore(),
      type: 'shared'
    })
  )

  try {
    const authed = await agent.request({
      origin,
      path: '/account',
      method: 'GET',
      headers: { authorization: 'Bearer alice' }
    }).then(response => response.body.text())
    assert.equal(authed, 'alice-private-object')

    state.authEnabled = false
    // A caller with a *different* Authorization header must not match Alice's
    // cached entry, even though both carry an Authorization header.
    const bob = await agent.request({
      origin,
      path: '/account',
      method: 'GET',
      headers: { authorization: 'Bearer bob' }
    }).then(response => response.body.text())
    assert.equal(bob, 'denied')
    assert.notEqual(bob, 'alice-private-object')
  } finally {
    await agent.close()
    await closeServer(server)
  }
})

// A redirect hop that is already stale must not inherit the final response's
// freshness. This covers current age, expiration, and invalid freshness values.
for (const staleHop of [
  {
    name: 'Age exhausts max-age',
    statusCode: 301,
    headers: () => ({
      'cache-control': 'public, max-age=60',
      age: '60'
    })
  },
  {
    name: 'Expires is already past',
    statusCode: 302,
    headers: () => ({
      expires: new Date(Date.now() - 60_000).toUTCString()
    })
  },
  {
    name: 'max-age is malformed',
    statusCode: 302,
    headers: () => ({
      'cache-control': 'public, max-age=invalid'
    })
  }
]) {
  test(`cache does not store an already stale redirect hop (${staleHop.name})`, async () => {
    const state = { redirectEnabled: true, hits: 0 }
    const server = createServer((req, res) => {
      state.hits++
      if (state.redirectEnabled && req.url === '/dynamic') {
        res.writeHead(staleHop.statusCode, {
          ...staleHop.headers(),
          location: '/attacker-choice'
        })
        res.end()
        return
      }
      if (req.url === '/attacker-choice') {
        res.writeHead(200, { 'cache-control': 'public, max-age=86400' })
        res.end('attacker-choice')
        return
      }
      res.writeHead(200, { 'cache-control': 'no-store' })
      res.end('legitimate-content')
    })

    await listen(server)
    const origin = `http://127.0.0.1:${server.address().port}`
    const agent = new Agent().compose(
      interceptors.redirect({ maxRedirections: 2 }),
      interceptors.cache({
        store: new cacheStores.MemoryCacheStore(),
        type: 'shared'
      })
    )

    try {
      const first = await agent.request({ origin, path: '/dynamic', method: 'GET' })
        .then(response => response.body.text())
      assert.equal(first, 'attacker-choice')

      state.redirectEnabled = false
      const hitsBefore = state.hits
      const second = await agent.request({ origin, path: '/dynamic', method: 'GET' })
        .then(response => response.body.text())

      assert.equal(second, 'legitimate-content')
      assert.equal(state.hits, hitsBefore + 1)
    } finally {
      await agent.close()
      await closeServer(server)
    }
  })
}

test('cache bounds redirect freshness by the hop remaining lifetime', async () => {
  const store = new cacheStores.MemoryCacheStore()
  const server = createServer((req, res) => {
    if (req.url === '/dynamic') {
      res.writeHead(301, {
        location: '/static',
        'cache-control': 'public, max-age=60',
        age: '50'
      })
      res.end()
      return
    }
    res.writeHead(200, { 'cache-control': 'public, max-age=3600' })
    res.end('static-content')
  })

  await listen(server)
  const origin = `http://127.0.0.1:${server.address().port}`
  const agent = new Agent().compose(
    interceptors.redirect({ maxRedirections: 2 }),
    interceptors.cache({ store, type: 'shared' })
  )

  try {
    const startedAt = Date.now()
    const body = await agent.request({ origin, path: '/dynamic', method: 'GET' })
      .then(response => response.body.text())
    assert.equal(body, 'static-content')

    const cached = store.get({ origin, path: '/dynamic', method: 'GET', headers: {} })
    assert.ok(cached)
    assert.ok(cached.staleAt > startedAt)
    assert.ok(cached.staleAt <= startedAt + 11_000)
  } finally {
    await agent.close()
    await closeServer(server)
  }
})

// GHSA-MQG3-3V4R-CM32, primitive 3: a bare (cache-control-less) 302 hop is not
// cacheable by default (RFC 9111 §3) and must not be folded into a cached entry
// under the original key, otherwise a dynamic redirect is frozen for the final
// response's freshness lifetime.
test('cache does not store a redirect response for a bare 302 hop without freshness', async () => {
  const state = { redirectEnabled: true, targetHits: 0 }
  const server = createServer((req, res) => {
    if (state.redirectEnabled && req.url === '/dynamic') {
      res.writeHead(302, { location: '/static' })
      res.end()
      return
    }
    state.targetHits++
    res.writeHead(200, {
      'cache-control': 'public, max-age=3600',
      'content-type': 'text/plain'
    })
    res.end('static-content')
  })

  await listen(server)
  const origin = `http://127.0.0.1:${server.address().port}`

  const agent = new Agent().compose(
    interceptors.redirect({ maxRedirections: 2 }),
    interceptors.cache({
      store: new cacheStores.MemoryCacheStore(),
      type: 'shared'
    })
  )

  try {
    const first = await agent.request({ origin, path: '/dynamic', method: 'GET' })
      .then(response => response.body.text())
    assert.equal(first, 'static-content')

    state.redirectEnabled = false
    const hitsBefore = state.targetHits
    const second = await agent.request({ origin, path: '/dynamic', method: 'GET' })
      .then(response => response.body.text())
    assert.equal(second, 'static-content')
    // Without an explicit freshness the 302 hop is uncacheable, so the dynamic
    // route is not frozen: the origin is contacted again for the second request.
    assert.equal(state.targetHits, hitsBefore + 1)
  } finally {
    await agent.close()
    await closeServer(server)
  }
})

// GHSA-MQG3-3V4R-CM32, primitive 3 (stale-serving): a suppressed redirect hop
// that grants no `stale-while-revalidate` / `stale-if-error` (RFC 5861) caps
// stale serving at its freshness. The final response's stale-serving directives
// must not launder a stale window past the hop-bounded `staleAt`, so a dynamic
// 302 (short `max-age`, no SWR) redirecting to a static target with a long
// `stale-while-revalidate` must not be served stale once the hop is stale.
test('cache does not serve a redirect entry stale past the hop freshness via the final stale-while-revalidate', async () => {
  const state = { redirectEnabled: true }
  const server = createServer((req, res) => {
    if (req.url === '/dynamic') {
      if (state.redirectEnabled) {
        res.writeHead(302, { location: '/static', 'cache-control': 'public, max-age=1' })
        res.end()
        return
      }
      res.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'text/plain' })
      res.end('dynamic-live')
      return
    }
    res.writeHead(200, {
      'cache-control': 'public, max-age=3600, stale-while-revalidate=3600',
      'content-type': 'text/plain'
    })
    res.end('static-content')
  })

  await listen(server)
  const origin = `http://127.0.0.1:${server.address().port}`
  const agent = new Agent().compose(
    interceptors.redirect({ maxRedirections: 2 }),
    interceptors.cache({ store: new cacheStores.MemoryCacheStore(), type: 'shared' })
  )

  try {
    // 1. Cache under /dynamic; staleAt is bounded to the hop's max-age=1.
    const first = await agent.request({ origin, path: '/dynamic', method: 'GET' })
      .then(r => r.body.text())
    assert.equal(first, 'static-content')

    // 2. Wait past the hop freshness (1s).
    await sleep(1500)

    // 3. Disable the redirect and request again. The hop freshness is exhausted,
    //    so the entry must not be served stale from the final SWR window; the
    //    dynamic route must be reached instead of serving stale 'static-content'.
    state.redirectEnabled = false
    const second = await agent.request({ origin, path: '/dynamic', method: 'GET' })
      .then(r => r.body.text())
    assert.notEqual(second, 'static-content')
  } finally {
    await agent.close()
    await closeServer(server)
  }
})

// Reproduces GHSA-7XG3-FPHP-28HG (CWE-524 / CWE-639).
//
// A credential-bearing **same-origin** redirect whose final hop advertises a
// permissive cache policy (`public`, `s-maxage`, or `must-revalidate`) must not
// be stored under the original (alias) URL key. The intermediate redirect here
// carries no restrictive `Cache-Control` (a bare 302), so the suppressed-hop
// guard does not trip, and the final hop shares the cache-key origin, so the
// cross-origin guard does not trip either. Because the store key omits the
// credential (and the final hop has no `Vary`), a later request for the alias
// URL by a different principal — or an anonymous caller — would be served the
// first principal's private body without re-contacting the origin.
//
// The credential matters even when the request is cookie-authenticated: the
// RFC-9111 §3.5 authenticated-request gate only inspects `Authorization`, so a
// cookie-only request with a plain `max-age` final hop was also disclosed. The
// same holds for `Proxy-Authorization`, which undici already classifies as a
// request credential in the redirect handler.
for (const { name, credentialHeaders, finalCacheControl } of [
  {
    name: 'authorization + public final hop',
    credentialHeaders: { authorization: 'Bearer alice' },
    finalCacheControl: 'public, max-age=600'
  },
  {
    name: 'authorization + must-revalidate final hop',
    credentialHeaders: { authorization: 'Bearer alice' },
    finalCacheControl: 'max-age=600, must-revalidate'
  },
  {
    name: 'cookie-only + public final hop',
    credentialHeaders: { cookie: 'session=alice' },
    finalCacheControl: 'public, max-age=600'
  },
  {
    name: 'cookie-only + max-age final hop (bypasses RFC 9111 §3.5 gate)',
    credentialHeaders: { cookie: 'session=alice' },
    finalCacheControl: 'max-age=600'
  },
  {
    name: 'proxy-authorization + public final hop',
    credentialHeaders: { 'proxy-authorization': 'Bearer alice' },
    finalCacheControl: 'public, max-age=600'
  }
]) {
  test(`cache does not store a same-origin redirect for a credential-bearing request under the alias key (${name})`, async () => {
    const state = { me: 0, profile: 0 }
    const server = createServer((req, res) => {
      const requestUrl = new URL(req.url, 'http://dummy')
      if (requestUrl.pathname === '/me') {
        state.me++
        const user = (req.headers.authorization || req.headers.cookie || req.headers['proxy-authorization'] || 'anon')
          .replace('Bearer ', '')
          .replace('session=', '')
        res.writeHead(302, { location: `/profile/${user}` })
        res.end()
        return
      }
      if (requestUrl.pathname.startsWith('/profile/')) {
        state.profile++
        const user = requestUrl.pathname.split('/')[2]
        res.writeHead(200, {
          'cache-control': finalCacheControl,
          'content-type': 'text/plain'
        })
        res.end(`${user.toUpperCase()} ssn=111-11-1111`)
        return
      }
      res.writeHead(404)
      res.end('not found')
    })

    await listen(server)
    const origin = `http://127.0.0.1:${server.address().port}`

    const agent = new Agent().compose(
      interceptors.redirect({ maxRedirections: 2 }),
      interceptors.cache({
        store: new cacheStores.MemoryCacheStore(),
        type: 'shared'
      })
    )

    const requestAs = (user, headers) => agent.request({
      origin,
      path: '/me',
      method: 'GET',
      headers
    }).then(response => response.body.text())

    try {
      const alice = await requestAs('alice', credentialHeaders)
      assert.equal(alice, 'ALICE ssn=111-11-1111')

      // A different principal must receive its own profile, and an anonymous
      // caller must also reach the origin rather than be served Alice's body.
      const bob = await requestAs('bob', {
        authorization: 'Bearer bob'
      })
      const anon = await requestAs('anon', undefined)

      assert.equal(bob, 'BOB ssn=111-11-1111')
      assert.equal(anon, 'ANON ssn=111-11-1111')
      // Every request must have reached the origin: nothing was stored under
      // the alias key, so none were served from the shared cache.
      assert.equal(state.me, 3)
      assert.equal(state.profile, 3)
    } finally {
      await agent.close()
      await closeServer(server)
    }
  })
}

// The fix must not regress the legitimate same-origin redirect caching for
// requests that carry no credential: those are still cached under the original
// key, so the redirect target is not re-fetched on a repeat request.
test('cache still stores an unauthenticated same-origin redirect under the original key', async () => {
  const state = { hits: 0 }
  const server = createServer((req, res) => {
    if (req.url === '/alias') {
      res.writeHead(302, { location: '/target' })
      res.end()
      return
    }
    state.hits++
    res.writeHead(200, {
      'cache-control': 'public, max-age=600',
      'content-type': 'text/plain'
    })
    res.end('public-content')
  })

  await listen(server)
  const origin = `http://127.0.0.1:${server.address().port}`

  const agent = new Agent().compose(
    interceptors.redirect({ maxRedirections: 2 }),
    interceptors.cache({
      store: new cacheStores.MemoryCacheStore(),
      type: 'shared'
    })
  )

  try {
    const first = await agent.request({
      origin,
      path: '/alias',
      method: 'GET'
    }).then(response => response.body.text())
    assert.equal(first, 'public-content')

    const hitsBefore = state.hits
    const second = await agent.request({
      origin,
      path: '/alias',
      method: 'GET'
    }).then(response => response.body.text())

    assert.equal(second, 'public-content')
    // The repeat request must be a cache hit (the target was not re-fetched).
    assert.equal(state.hits, hitsBefore)
  } finally {
    await agent.close()
    await closeServer(server)
  }
})

// The credential guard must key on an *actual* redirect, not merely a non-empty
// redirect history. A credential-bearing response that was not redirected is
// legitimately cacheable under RFC 9111 §3.5 when it carries `public`, and must
// still be revalidated and refreshed normally. The redirect handler records
// every hop in `history` (including the single final hop), and on revalidation
// the cache handler's deferred `onRequestStart` sees that entry, so a guard that
// fired on a non-empty history would mistake a plain revalidation for a redirect
// and never replace the stale entry.
test('cache refreshes a credential-bearing non-redirected entry on revalidation', async () => {
  const state = { version: 1, ifNoneMatch: [] }
  const server = createServer((req, res) => {
    const inm = req.headers['if-none-match']
    if (inm) state.ifNoneMatch.push(inm)
    const etag = `"v${state.version}"`
    if (inm === etag) {
      res.writeHead(304, { etag, 'cache-control': 'public, max-age=0' })
      res.end()
      return
    }
    res.writeHead(200, {
      etag,
      'cache-control': 'public, max-age=0',
      'content-type': 'text/plain'
    })
    res.end(`DATA-${state.version}`)
  })

  await listen(server)
  const origin = `http://127.0.0.1:${server.address().port}`

  const agent = new Agent().compose(
    interceptors.redirect({ maxRedirections: 2 }),
    interceptors.cache({
      store: new cacheStores.MemoryCacheStore(),
      type: 'shared'
    })
  )

  const get = () => agent.request({
    origin,
    path: '/data',
    method: 'GET',
    headers: { authorization: 'Bearer alice' }
  }).then(response => response.body.text())

  try {
    assert.equal(await get(), 'DATA-1')
    state.version = 2
    // Revalidation returns a fresh 200; the entry must be refreshed to v2.
    assert.equal(await get(), 'DATA-2')
    // A subsequent request must revalidate against the refreshed etag, proving
    // the cache stored v2 rather than remaining stuck on v1.
    await get()
    assert.ok(
      state.ifNoneMatch.includes('"v2"'),
      `cache never refreshed past v1 (origin saw ${JSON.stringify(state.ifNoneMatch)})`
    )
  } finally {
    await agent.close()
    await closeServer(server)
  }
})
