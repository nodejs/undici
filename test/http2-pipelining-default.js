'use strict'

const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')
const { tspl } = require('@matteo.collina/tspl')
const pem = require('@metcoder95/https-pem')

const { Client, Pool } = require('..')

test('h2 client multiplexes concurrent requests by default (#4143)', async t => {
  const N = 5
  const DELAY = 200
  t = tspl(t, { plan: N + 1 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  let inFlight = 0
  let peakInFlight = 0
  server.on('stream', stream => {
    inFlight++
    peakInFlight = Math.max(peakInFlight, inFlight)
    setTimeout(() => {
      inFlight--
      stream.respond({ ':status': 200 })
      stream.end('ok')
    }, DELAY)
  })

  await once(server.listen(0), 'listening')
  after(() => server.close())

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: { rejectUnauthorized: false },
    allowH2: true
  })
  after(() => client.close())

  const results = await Promise.all(
    Array.from({ length: N }, () =>
      client.request({ path: '/', method: 'GET' })
        .then(async r => {
          await r.body.text()
          return r.statusCode
        })
    )
  )

  for (const status of results) {
    t.strictEqual(status, 200)
  }

  // Without the fix, peakInFlight === 1 (the h1 pipelining gate of 1 was being
  // applied to the h2 dispatch path). With the fix, the h2 dispatch ceiling
  // is maxConcurrentStreams (default 100), so all N stream concurrently.
  t.strictEqual(peakInFlight, N, `expected ${N} concurrent streams, got ${peakInFlight}`)

  await t.completed
})

test('Pool on h2 reuses a single session instead of fanning out (#4143)', async t => {
  const N = 5
  const DELAY = 200
  t = tspl(t, { plan: N + 2 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  const sessions = new Set()
  const sockets = new Set()
  server.on('session', s => sessions.add(s))
  server.on('connection', s => sockets.add(s))
  server.on('stream', stream => {
    setTimeout(() => {
      stream.respond({ ':status': 200 })
      stream.end('ok')
    }, DELAY)
  })

  await once(server.listen(0), 'listening')
  after(() => server.close())

  // Default Pool: no `connections` cap. h2 should still multiplex on a single
  // session instead of opening one TCP socket / h2 session per concurrent
  // request.
  const pool = new Pool(`https://localhost:${server.address().port}`, {
    connect: { rejectUnauthorized: false },
    allowH2: true
  })
  after(() => pool.close())

  const results = await Promise.all(
    Array.from({ length: N }, () =>
      pool.request({ path: '/', method: 'GET' })
        .then(async r => {
          await r.body.text()
          return r.statusCode
        })
    )
  )
  for (const status of results) t.strictEqual(status, 200)

  // Pool should consolidate concurrent h2 dispatches onto one session.
  t.strictEqual(sessions.size, 1, `expected 1 h2 session, got ${sessions.size}`)
  t.strictEqual(sockets.size, 1, `expected 1 TCP socket, got ${sockets.size}`)

  await t.completed
})

test('Client#pipelining keeps its h1 (RFC7230) semantic on an h2 client', async t => {
  t = tspl(t, { plan: 2 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  server.on('stream', stream => {
    stream.respond({ ':status': 200 })
    stream.end('ok')
  })
  await once(server.listen(0), 'listening')
  after(() => server.close())

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: { rejectUnauthorized: false },
    allowH2: true
  })
  after(() => client.close())

  // Even after negotiating h2, client.pipelining reflects only the user-set
  // h1 pipelining factor — the h2 dispatch limit is maxConcurrentStreams.
  const r = await client.request({ path: '/', method: 'GET' })
  await r.body.text()
  t.strictEqual(client.pipelining, 1)

  client.pipelining = 4
  t.strictEqual(client.pipelining, 4)

  await t.completed
})
