'use strict'

const assert = require('node:assert')
const { once } = require('node:events')
const { createSecureServer } = require('node:http2')
const { setTimeout: sleep } = require('node:timers/promises')
const { test } = require('node:test')
const pem = require('@metcoder95/https-pem')

const { Pool } = require('..')

// With allowH2 on an https: origin, a Pool designates one Client as the protocol
// probe and queues later requests until ALPN completes. If the request that
// triggered the probe is rejected while the Request is being built (an invalid
// header throws before the request is queued), the probe Client never connects,
// so nothing clears the probe. Every later request on that Pool then stays
// queued forever (#6141). A warm Pool is unaffected: only the bad request fails.

// Resolve or reject if a request settles; fail loudly if it hangs instead of
// letting the whole test time out with no context.
async function within (promise, ms, message) {
  // If the guard wins, `promise` stays pending and is later rejected by
  // pool.destroy(); swallow that so it does not surface as an unhandled rejection.
  promise.catch(() => {})
  let timer
  const guard = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  try {
    return await Promise.race([promise, guard])
  } finally {
    clearTimeout(timer)
  }
}

function makeServer (t) {
  return (async () => {
    const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
    server.on('error', () => {})
    server.on('stream', (stream) => {
      stream.respond({ ':status': 200 })
      stream.end('ok')
    })
    t.after(() => server.close())
    await once(server.listen(0), 'listening')
    return `https://localhost:${server.address().port}`
  })()
}

test('Issue #6141 - a request rejected while the Pool is probing does not wedge later requests', async (t) => {
  const origin = await makeServer(t)
  const pool = new Pool(origin, { allowH2: true, connect: { rejectUnauthorized: false } })
  t.after(() => pool.destroy())

  // First request on a fresh Pool is the probe and is rejected during Request
  // construction (the `expect` header is not supported).
  await assert.rejects(
    pool.request({ path: '/', method: 'GET', headers: { expect: '100-continue' } }),
    { code: 'UND_ERR_NOT_SUPPORTED' }
  )

  // Before the fix this request stayed queued forever.
  const res = await within(
    pool.request({ path: '/', method: 'GET' }),
    2000,
    'later request hung: the protocol probe was never cleared'
  )
  assert.strictEqual(res.statusCode, 200)
  await res.body.dump()
})

test('Issue #6141 - the probe is cleared again after a clientTtl rotation', async (t) => {
  const origin = await makeServer(t)
  const pool = new Pool(origin, { allowH2: true, clientTtl: 200, connect: { rejectUnauthorized: false } })
  t.after(() => pool.destroy())

  const warm = await pool.request({ path: '/', method: 'GET' })
  assert.strictEqual(warm.statusCode, 200)
  await warm.body.dump()

  // Let the warmed client pass its ttl so the next request creates a fresh
  // probe client, which is then rejected during Request construction.
  await sleep(300)
  await assert.rejects(
    pool.request({ path: '/', method: 'GET', headers: { expect: '100-continue' } }),
    { code: 'UND_ERR_NOT_SUPPORTED' }
  )

  const res = await within(
    pool.request({ path: '/', method: 'GET' }),
    2000,
    'later request hung after clientTtl rotation: the protocol probe was never cleared'
  )
  assert.strictEqual(res.statusCode, 200)
  await res.body.dump()
})
