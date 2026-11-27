'use strict'

// maxConcurrentStreams (default 100) is the client's own ceiling on concurrent
// HTTP/2 streams. The server's SETTINGS_MAX_CONCURRENT_STREAMS can lower it
// but must not raise it: a default Node.js server advertises 2^32-1, which
// used to replace the configured value and remove the limit entirely.

const { test, after } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http2')
const { once } = require('node:events')

const { Client, H2CClient, Pool } = require('..')

// Serves each request after a short delay and records the highest number of
// streams open at once.
async function startServer (settings) {
  const server = createServer(settings ? { settings } : {})
  const stats = { active: 0, peak: 0 }

  server.on('stream', (stream) => {
    stats.active++
    stats.peak = Math.max(stats.peak, stats.active)
    stream.on('error', () => {})
    stream.respond({ ':status': 200 })
    setTimeout(() => {
      stats.active--
      stream.end('ok')
    }, 20)
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')
  return { server, stats, origin: `http://localhost:${server.address().port}` }
}

function track (client) {
  after(() => client.close())
  return client
}

async function requestMany (client, count) {
  const statuses = await Promise.all(Array.from({ length: count }, async (_, i) => {
    const res = await client.request({ path: `/${i}`, method: 'GET' })
    await res.body.text()
    return res.statusCode
  }))
  assert.deepStrictEqual(statuses, Array(count).fill(200))
}

test('h2Options.maxConcurrentStreams caps streams when the server allows more', async () => {
  const { stats, origin } = await startServer()
  const client = track(new Client(origin, { useH2c: true, h2Options: { maxConcurrentStreams: 2 } }))

  await requestMany(client, 20)
  assert.strictEqual(stats.peak, 2)
})

test('the deprecated top-level maxConcurrentStreams caps streams too', async () => {
  const { stats, origin } = await startServer()
  const client = track(new Client(origin, { useH2c: true, maxConcurrentStreams: 2 }))

  await requestMany(client, 20)
  assert.strictEqual(stats.peak, 2)
})

test('H2CClient maxConcurrentStreams caps streams', async () => {
  const { stats, origin } = await startServer()
  const client = track(new H2CClient(origin, { maxConcurrentStreams: 2, pipelining: 2 }))

  await requestMany(client, 20)
  assert.strictEqual(stats.peak, 2)
})

test('the configured limit applies when the server advertises a higher one', async () => {
  const { stats, origin } = await startServer({ maxConcurrentStreams: 5 })
  const client = track(new Client(origin, { useH2c: true, h2Options: { maxConcurrentStreams: 2 } }))

  await requestMany(client, 20)
  assert.strictEqual(stats.peak, 2)
})

test('the server limit applies when it is lower than the configured one', async () => {
  const { stats, origin } = await startServer({ maxConcurrentStreams: 5 })
  const client = track(new Client(origin, { useH2c: true, h2Options: { maxConcurrentStreams: 10 } }))

  await requestMany(client, 20)
  assert.strictEqual(stats.peak, 5)
})

test('the default limit of 100 applies when the server allows more', async () => {
  const { stats, origin } = await startServer()
  const client = track(new Client(origin, { useH2c: true }))

  await requestMany(client, 150)
  assert.strictEqual(stats.peak, 100)
})

test('a server raising its limit later does not lift the configured one', async () => {
  const { server, stats, origin } = await startServer({ maxConcurrentStreams: 5 })
  const raised = new Promise((resolve) => {
    server.on('session', (session) => {
      session.settings({ maxConcurrentStreams: 1000 }, resolve)
    })
  })
  const client = track(new Client(origin, { useH2c: true, h2Options: { maxConcurrentStreams: 3 } }))

  // One request to establish the session and let the raised limit arrive.
  await requestMany(client, 1)
  await raised

  stats.peak = 0
  await requestMany(client, 20)
  assert.strictEqual(stats.peak, 3)
})

// A Pool queues requests while its first client negotiates the protocol, then
// hands them to that client once h2 is confirmed. When that client reaches
// maxConcurrentStreams the rest must go to new connections, up to
// `connections`, instead of waiting for the first one to free up.
test('a Pool spreads requests queued during h2 negotiation across connections', { timeout: 10_000 }, async () => {
  const connections = 3
  const maxConcurrentStreams = 2
  const target = connections * maxConcurrentStreams

  const server = createServer()
  const sessions = new Set()
  const held = []
  let released = false

  // Hold every stream until `target` are open at once, which is only possible
  // if the Pool opened all of its connections. Then answer everything. If the
  // Pool never fans out, this never happens and the test times out.
  server.on('stream', (stream) => {
    sessions.add(stream.session)
    stream.on('error', () => {})
    held.push(stream)

    if (released || held.length === target) {
      released = true
      for (const s of held.splice(0)) {
        s.respond({ ':status': 200 })
        s.end('ok')
      }
    }
  })
  after(() => server.close())
  await once(server.listen(0), 'listening')

  const pool = new Pool(`http://localhost:${server.address().port}`, {
    connections,
    useH2c: true,
    h2Options: { maxConcurrentStreams }
  })
  // destroy() rather than close(): on failure the held requests never finish,
  // and close() would wait for them.
  after(() => pool.destroy())

  // All requests are dispatched before the first connection is established.
  await requestMany(pool, target * 2)
  assert.strictEqual(sessions.size, connections)
})
