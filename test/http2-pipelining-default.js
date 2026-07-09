'use strict'

const { test, after } = require('node:test')
const { createSecureServer, createServer } = require('node:http2')
const { once } = require('node:events')
const { tspl } = require('@matteo.collina/tspl')
const pem = require('@metcoder95/https-pem')

const { Agent, Client, Pool, fetch } = require('..')

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

test('Pool with connections=1 multiplexes h2 streams on the single session (#4143)', async t => {
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

  // With connections=1 the Pool funnels every dispatch through a single
  // Client; that Client's h2 context lets the N concurrent requests
  // multiplex on one session.
  //
  // The unconstrained Pool case (no `connections` cap) is intentionally
  // not asserted here: during the TLS/ALPN handshake the Client cannot
  // yet know whether h2 will be negotiated, so the per-Client `kPending`
  // gate still fans out and a cold burst opens one socket per request.
  // Resolving that needs a Pool-level lazy-connect strategy and is left
  // for a follow-up (see #4143 discussion).
  const pool = new Pool(`https://localhost:${server.address().port}`, {
    connect: { rejectUnauthorized: false },
    allowH2: true,
    connections: 1
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

  t.strictEqual(sessions.size, 1, `expected 1 h2 session, got ${sessions.size}`)
  t.strictEqual(sockets.size, 1, `expected 1 TCP socket, got ${sockets.size}`)

  await t.completed
})

test('fetch POST multiplexes while an SSE stream is open on the same h2 session (#5524)', async t => {
  t = tspl(t, { plan: 4 })

  const server = createServer()
  const paths = []
  const sessions = new Set()
  let eventsOpened
  const eventsOpenedPromise = new Promise(resolve => {
    eventsOpened = resolve
  })

  server.on('session', session => {
    sessions.add(session)
  })

  server.on('stream', (stream, headers) => {
    paths.push(headers[':path'])

    if (headers[':path'] === '/events') {
      stream.respond({ ':status': 200, 'content-type': 'text/event-stream' })
      stream.write(': ping\n\n')
      eventsOpened()
      return
    }

    stream.respond({ ':status': 200, 'content-type': 'application/json' })
    stream.end('{"ok":true}')
  })

  await once(server.listen(0, '127.0.0.1'), 'listening')
  after(() => server.close())

  const dispatcher = new Agent({ useH2c: true })
  const sse = new AbortController()
  after(async () => {
    sse.abort()
    await dispatcher.close()
  })

  const origin = `http://127.0.0.1:${server.address().port}`

  const warmup = await fetch(`${origin}/warmup`, {
    method: 'POST',
    body: '{"warmup":true}',
    dispatcher
  })
  await warmup.text()

  fetch(`${origin}/events`, {
    dispatcher,
    signal: sse.signal
  }).catch(() => {})
  await eventsOpenedPromise

  const response = await fetch(`${origin}/rpc`, {
    method: 'POST',
    body: '{"ok":true}',
    dispatcher,
    signal: AbortSignal.timeout(5000)
  })

  t.strictEqual(response.status, 200)
  t.strictEqual(await response.text(), '{"ok":true}')
  t.deepStrictEqual(paths, ['/warmup', '/events', '/rpc'])
  t.strictEqual(sessions.size, 1)

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
