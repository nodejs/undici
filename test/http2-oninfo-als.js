'use strict'

const assert = require('node:assert')
const { AsyncLocalStorage } = require('node:async_hooks')
const { once } = require('node:events')
const { readFileSync } = require('node:fs')
const { createSecureServer } = require('node:http2')
const { join } = require('node:path')
const { test } = require('node:test')

const { Client } = require('..')

const key = readFileSync(join(__dirname, 'fixtures', 'key.pem'))
const cert = readFileSync(join(__dirname, 'fixtures', 'cert.pem'))

const PAIRS = 5

// One HTTP/2 session multiplexes several streams, so the transport-level
// callback context for a stream is the session's context, not the stream's.
// onInfo must still run in the owning request's AsyncResource context, the
// same invariant the final-response and error callbacks already honour.
// https://github.com/nodejs/undici/security/advisories/GHSA-7w57-7r64-8jgq
function buildServer () {
  const pending = new Map()
  let sentInfoCount = 0

  const server = createSecureServer({ key, cert })

  server.on('stream', (stream, headers) => {
    const match = /^\/pair\/(\d+)\/(alice|bob)$/.exec(headers[':path'])
    if (!match) {
      stream.respond({ ':status': 404 })
      stream.end()
      return
    }

    const pairId = match[1]
    const tenant = match[2]
    let pair = pending.get(pairId)
    if (!pair) {
      pair = { alice: null, bob: null, count: 0 }
      pending.set(pairId, pair)
    }
    pair[tenant] = stream
    pair.count++
    if (pair.count !== 2) return

    const { alice, bob } = pair
    // Only Bob's stream gets an informational (103) response carrying a
    // tenant-scoped Link header.
    bob.additionalHeaders({
      ':status': 103,
      link: `</pair/${pairId}/bob.css>; rel=preload; as=style`
    })
    sentInfoCount++
    for (const responseStream of [alice, bob]) {
      responseStream.respond({ ':status': 200, 'content-length': '2' })
      responseStream.end('ok')
    }
    pending.delete(pairId)
  })

  return { server, sentInfoCount: () => sentInfoCount }
}

function makeClient (origin) {
  return new Client(origin, {
    allowH2: true,
    connect: { rejectUnauthorized: false }
  })
}

async function run (t, perRequestClient) {
  const storage = new AsyncLocalStorage()
  const observations = []
  const { server, sentInfoCount } = buildServer()

  server.listen(0)
  await once(server, 'listening')
  t.after(() => server.close())

  const origin = `https://localhost:${server.address().port}`
  const shared = perRequestClient ? null : makeClient(origin)
  const clients = new Set(shared ? [shared] : [])
  const pairs = []

  try {
    for (let pairId = 0; pairId < PAIRS; pairId++) {
      const requestFor = (tenant) => {
        const client = shared ?? makeClient(origin)
        clients.add(client)
        return storage.run({ tenant }, () => client.request({
          path: `/pair/${pairId}/${tenant}`,
          method: 'GET',
          onInfo: (info) => {
            observations.push({
              expected: tenant,
              observed: storage.getStore()?.tenant ?? null,
              statusCode: info.statusCode,
              link: info.headers.link ?? null
            })
          }
        }))
      }
      pairs.push(Promise.all([requestFor('alice'), requestFor('bob')]))
    }

    const responses = await Promise.all(pairs)
    await Promise.all(responses.flat().map((response) => response.body.text()))
  } finally {
    await Promise.all([...clients].map((client) => client.close()))
  }

  return { observations, sentInfoCount: sentInfoCount() }
}

test('shared HTTP/2 Client: onInfo runs in its request AsyncLocalStorage context', async (t) => {
  const { observations, sentInfoCount } = await run(t, false)

  assert.strictEqual(sentInfoCount, PAIRS)
  assert.strictEqual(observations.length, PAIRS)
  for (const event of observations) {
    assert.strictEqual(event.statusCode, 103)
    assert.strictEqual(event.observed, event.expected)
    assert.ok(event.link.endsWith('/bob.css>; rel=preload; as=style'))
  }
})

test('per-request HTTP/2 Client control: onInfo runs in its request AsyncLocalStorage context', async (t) => {
  const { observations, sentInfoCount } = await run(t, true)

  assert.strictEqual(sentInfoCount, PAIRS)
  assert.strictEqual(observations.length, PAIRS)
  for (const event of observations) {
    assert.strictEqual(event.statusCode, 103)
    assert.strictEqual(event.observed, event.expected)
    assert.ok(event.link.endsWith('/bob.css>; rel=preload; as=style'))
  }
})
