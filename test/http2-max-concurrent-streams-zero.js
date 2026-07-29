'use strict'

const assert = require('node:assert')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client, Agent } = require('..')
const { kMaxConcurrentStreams } = require('../lib/core/symbols')

// RFC 9113 §6.5.2 lets a server advertise SETTINGS_MAX_CONCURRENT_STREAMS = 0
// to temporarily refuse new streams (graceful drain, overload shedding, a load
// balancer draining a backend).
//
// The value is stored on the Client and makes client-h2's busy() degenerate to
// `running >= 0`, i.e. permanently busy. Nothing covers a request that is still
// queued: headersTimeout/bodyTimeout are armed on a stream that is never
// created, the h2 idle timeout bails while kSize !== 0, PING keeps succeeding,
// and _resume() returns at busy(request) so no new connection is ever made --
// which means a later SETTINGS frame that would lift the limit can never
// arrive either.

function settleOrTimeout (promise, ms) {
  let timer
  return Promise.race([
    promise.then(() => 'settled', () => 'settled'),
    new Promise((resolve) => { timer = setTimeout(() => resolve('stuck'), ms) })
  ]).finally(() => clearTimeout(timer))
}

// A wedged h2 client unrefs its session and arms no timer, so the event loop
// can drain while a request is still outstanding. Hold it open for the
// duration of the test, otherwise the runner reports "Promise resolution is
// still pending but the event loop has already resolved" and hangs.
function holdEventLoop () {
  const timer = setInterval(() => {}, 1000)
  return () => clearInterval(timer)
}

async function drainingServer () {
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  // A wedged h2 session never ends on its own, so server.close() would hang.
  const sessions = new Set()
  server.on('session', (session) => {
    sessions.add(session)
    session.on('close', () => sessions.delete(session))
  })
  server.shutdown = () => {
    for (const session of sessions) session.destroy()
    server.close()
  }

  server.on('stream', (stream) => {
    stream.on('error', () => {})
    stream.respond({ ':status': 200 })
    stream.end('ok')
  })

  // Serve normally, then start draining.
  server.on('session', (session) => {
    session.once('stream', () => {
      setTimeout(() => {
        try {
          session.settings({ maxConcurrentStreams: 0 })
        } catch {}
      }, 50)
    })
  })

  await once(server.listen(0), 'listening')
  return server
}

test('a request queued behind maxConcurrentStreams: 0 must not hang forever', async () => {
  const release = holdEventLoop()
  const server = await drainingServer()

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: { rejectUnauthorized: false },
    allowH2: true,
    headersTimeout: 500,
    bodyTimeout: 500
  })
  after(async () => {
    await client.destroy()
    server.shutdown()
    release()
  })

  const warm = await client.request({ path: '/', method: 'GET' })
  assert.strictEqual(warm.statusCode, 200)
  await warm.body.dump()

  // Let the drain SETTINGS land.
  await new Promise(resolve => setTimeout(resolve, 300))
  assert.strictEqual(client[kMaxConcurrentStreams], 0, 'server has drained to 0 streams')

  // The request never reaches a stream, so no per-stream timeout can fire.
  // Something must still settle it rather than queueing it indefinitely.
  const pending = client.request({ path: '/after-drain', method: 'GET' })
    .then(res => res.body.dump(), () => {})
  const outcome = await settleOrTimeout(pending, 2000)

  // destroy() errors whatever is still queued, so the dangling promise settles
  await client.destroy()
  await pending

  assert.strictEqual(outcome, 'settled', 'request queued behind a 0-stream limit never settled')
})

test('a drained h2 origin must not accumulate wedged connections', async () => {
  const release = holdEventLoop()
  const server = await drainingServer()

  const origin = `https://localhost:${server.address().port}`
  const agent = new Agent({
    connect: { rejectUnauthorized: false },
    allowH2: true,
    headersTimeout: 500,
    bodyTimeout: 500
  })
  after(async () => {
    await agent.destroy()
    server.shutdown()
    release()
  })

  // Warm the pool and let the drain SETTINGS land, so every later request
  // really does meet a wedged Client.
  const warm = await agent.request({ origin, path: '/warm', method: 'GET' })
  await warm.body.dump()
  await new Promise(resolve => setTimeout(resolve, 300))

  // Every request that finds the existing Clients wedged makes the Pool build
  // another Client + socket, which serves one request and wedges in turn. Those
  // sockets must not pile up for the lifetime of the process.
  let live = 0
  server.on('session', (session) => {
    live++
    session.on('close', () => live--)
  })

  const unsettled = []
  for (let round = 0; round < 3; round++) {
    const pending = [...Array(4)].map((_, i) =>
      agent.request({ origin, path: `/r${round}-${i}`, method: 'GET' }).then(res => res.body.dump(), () => {}))
    const outcomes = await Promise.all(pending.map(p => settleOrTimeout(p, 3000)))
    unsettled.push(...outcomes.filter(o => o === 'stuck'))
  }

  // Give the drained sessions time to be torn down.
  await new Promise(resolve => setTimeout(resolve, 1000))
  const stillOpen = live

  await agent.destroy()

  assert.strictEqual(unsettled.length, 0, 'no request may be left unsettled')
  assert.ok(stillOpen <= 4, `${stillOpen} wedged connections were still open after 12 requests`)
})
