'use strict'

const { test } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')
const { tspl } = require('@matteo.collina/tspl')
const pem = require('@metcoder95/https-pem')

const { Client, Pool } = require('..')

async function startServer (t, { maxConcurrentStreams }) {
  const server = createSecureServer({
    ...await pem.generate({ opts: { keySize: 2048 } }),
    settings: { maxConcurrentStreams }
  })

  const state = { peakPerSession: 0, sessions: new Set() }
  server.on('session', session => {
    session.inFlight = 0
    state.sessions.add(session)
  })
  server.on('stream', stream => {
    const session = stream.session
    session.inFlight++
    state.peakPerSession = Math.max(state.peakPerSession, session.inFlight)
    setTimeout(() => {
      session.inFlight--
      stream.respond({ ':status': 200 })
      stream.end('ok')
    }, 200)
  })

  await once(server.listen(0), 'listening')
  t.after(() => {
    for (const session of state.sessions) session.destroy()
    server.close()
  })
  return { origin: `https://localhost:${server.address().port}`, state }
}

async function request (dispatcher) {
  const { statusCode, body } = await dispatcher.request({ path: '/', method: 'GET' })
  await body.text()
  return statusCode
}

test('h2 maxConcurrentStreamsCap bounds streams below the server limit', async t => {
  const { origin, state } = await startServer(t, { maxConcurrentStreams: 100 })

  const client = new Client(origin, {
    connect: { rejectUnauthorized: false },
    allowH2: true,
    h2Options: { maxConcurrentStreamsCap: 2 }
  })
  t.after(() => client.destroy())
  const p = tspl(t, { plan: 2 })

  const statuses = await Promise.all(Array.from({ length: 6 }, () => request(client)))

  p.deepStrictEqual(statuses, Array(6).fill(200))
  p.strictEqual(state.peakPerSession, 2)

  await p.completed
})

test('h2 maxConcurrentStreamsCap does not raise a lower server limit', async t => {
  const { origin, state } = await startServer(t, { maxConcurrentStreams: 2 })

  const client = new Client(origin, {
    connect: { rejectUnauthorized: false },
    allowH2: true,
    h2Options: { maxConcurrentStreamsCap: 10 }
  })
  t.after(() => client.destroy())
  const p = tspl(t, { plan: 2 })

  const statuses = await Promise.all(Array.from({ length: 6 }, () => request(client)))

  p.deepStrictEqual(statuses, Array(6).fill(200))
  p.strictEqual(state.peakPerSession, 2)

  await p.completed
})

test('h2 without maxConcurrentStreamsCap follows the server limit', async t => {
  const { origin, state } = await startServer(t, { maxConcurrentStreams: 100 })

  const client = new Client(origin, {
    connect: { rejectUnauthorized: false },
    allowH2: true
  })
  t.after(() => client.destroy())
  const p = tspl(t, { plan: 2 })

  const statuses = await Promise.all(Array.from({ length: 6 }, () => request(client)))

  p.deepStrictEqual(statuses, Array(6).fill(200))
  p.strictEqual(state.peakPerSession, 6)

  await p.completed
})

test('Pool opens more h2 sessions when a session reaches maxConcurrentStreamsCap', async t => {
  const { origin, state } = await startServer(t, { maxConcurrentStreams: 100 })

  const pool = new Pool(origin, {
    connect: { rejectUnauthorized: false },
    allowH2: true,
    connections: 4,
    h2Options: { maxConcurrentStreamsCap: 2 }
  })
  t.after(() => pool.destroy())
  const p = tspl(t, { plan: 3 })

  await request(pool)
  const statuses = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    new Promise(resolve => setTimeout(resolve, i * 10)).then(() => request(pool))
  ))

  p.deepStrictEqual(statuses, Array(8).fill(200))
  p.ok(state.peakPerSession <= 2, `expected at most 2 streams per session, got ${state.peakPerSession}`)
  p.ok(state.sessions.size > 1, `expected more than one session, got ${state.sessions.size}`)

  await p.completed
})
