'use strict'

// Regression coverage for https://github.com/nodejs/undici/issues/5787
// `maxRequestsPerClient` must retire an HTTP/2 session once it has opened the
// configured number of streams, letting accepted streams finish before the
// session closes and queued work moves to a fresh session.

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer, createServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client, H2CClient, Pool, errors } = require('..')

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Records how many streams each physical HTTP/2 session accepted, in the order
// the sessions first saw a stream.
function trackSessions (server) {
  const counts = new Map()

  server.on('stream', (stream) => {
    counts.set(stream.session, (counts.get(stream.session) ?? 0) + 1)
  })

  return {
    get perSession () {
      return [...counts.values()]
    },
    get sessionCount () {
      return counts.size
    }
  }
}

function respond (stream, delay = 0) {
  if (delay === 0) {
    stream.respond({ ':status': 200 })
    stream.end('hello')
    return
  }

  setTimeout(() => {
    if (stream.closed || stream.destroyed) return
    stream.respond({ ':status': 200 })
    stream.end('hello')
  }, delay)
}

async function startSecureServer (t, onStream) {
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  const sessions = trackSessions(server)

  server.on('session', (session) => session.on('error', () => {}))
  server.on('stream', onStream)
  after(() => server.close())
  await once(server.listen(0), 'listening')

  return { server, sessions, origin: `https://localhost:${server.address().port}` }
}

async function startCleartextServer (t, onStream) {
  const server = createServer()
  const sessions = trackSessions(server)

  server.on('session', (session) => session.on('error', () => {}))
  server.on('stream', onStream)
  after(() => server.close())
  await once(server.listen(0), 'listening')

  return { server, sessions, origin: `http://localhost:${server.address().port}` }
}

function h2Client (origin, opts) {
  return new Client(origin, {
    connect: { rejectUnauthorized: false },
    allowH2: true,
    ...opts
  })
}

test('h2 sequential requests rotate the session at maxRequestsPerClient', async t => {
  t = tspl(t, { plan: 7 })

  const { sessions, origin } = await startSecureServer(t, (stream) => respond(stream))

  const client = h2Client(origin, { maxRequestsPerClient: 2 })
  after(() => client.close())

  for (let i = 0; i < 5; i++) {
    const response = await client.request({ path: '/', method: 'GET' })
    t.strictEqual(response.statusCode, 200)
    await response.body.text()
  }

  t.deepStrictEqual(sessions.perSession, [2, 2, 1])
  t.strictEqual(sessions.sessionCount, 3)
})

test('h2 concurrent requests never exceed maxRequestsPerClient per session', async t => {
  t = tspl(t, { plan: 3 })

  const { sessions, origin } = await startSecureServer(t, (stream) => respond(stream, 50))

  const client = h2Client(origin, { maxRequestsPerClient: 2 })
  after(() => client.close())

  // Warm the session up so that the remote SETTINGS have been received and the
  // client is genuinely allowed to multiplex the burst below.
  await (await client.request({ path: '/', method: 'GET' })).body.text()

  const responses = await Promise.all(
    Array.from({ length: 9 }, () => client.request({ path: '/', method: 'GET' }))
  )

  for (const response of responses) {
    await response.body.text()
  }

  t.strictEqual(responses.length, 9)
  t.ok(responses.every(response => response.statusCode === 200))
  t.ok(
    sessions.perSession.every(count => count <= 2),
    `expected no session above 2 streams, got ${JSON.stringify(sessions.perSession)}`
  )
})

test('h2 maxRequestsPerClient of 1 opens a session per request', async t => {
  t = tspl(t, { plan: 2 })

  const { sessions, origin } = await startSecureServer(t, (stream) => respond(stream))

  const client = h2Client(origin, { maxRequestsPerClient: 1 })
  after(() => client.close())

  for (let i = 0; i < 3; i++) {
    const response = await client.request({ path: '/', method: 'GET' })
    await response.body.text()
  }

  t.deepStrictEqual(sessions.perSession, [1, 1, 1])
  t.strictEqual(sessions.sessionCount, 3)
})

test('h2 maxRequestsPerClient of 0 disables the limit', async t => {
  t = tspl(t, { plan: 2 })

  const { sessions, origin } = await startSecureServer(t, (stream) => respond(stream))

  const client = h2Client(origin, { maxRequestsPerClient: 0 })
  after(() => client.close())

  for (let i = 0; i < 4; i++) {
    const response = await client.request({ path: '/', method: 'GET' })
    await response.body.text()
  }

  t.strictEqual(sessions.sessionCount, 1)
  t.deepStrictEqual(sessions.perSession, [4])
})

test('h2 without maxRequestsPerClient keeps sharing a single session', async t => {
  t = tspl(t, { plan: 2 })

  const { sessions, origin } = await startSecureServer(t, (stream) => respond(stream))

  const client = h2Client(origin)
  after(() => client.close())

  for (let i = 0; i < 4; i++) {
    const response = await client.request({ path: '/', method: 'GET' })
    await response.body.text()
  }

  t.strictEqual(sessions.sessionCount, 1)
  t.deepStrictEqual(sessions.perSession, [4])
})

test('h2c honours maxRequestsPerClient', async t => {
  t = tspl(t, { plan: 6 })

  const { sessions, origin } = await startCleartextServer(t, (stream) => respond(stream))

  const client = new H2CClient(origin, { maxRequestsPerClient: 2 })
  after(() => client.close())

  for (let i = 0; i < 5; i++) {
    const response = await client.request({ path: '/', method: 'GET' })
    t.strictEqual(response.statusCode, 200)
    await response.body.text()
  }

  t.deepStrictEqual(sessions.perSession, [2, 2, 1])
})

test('h2 pool resumes queued work after a session is retired', async t => {
  t = tspl(t, { plan: 3 })

  const { sessions, origin } = await startSecureServer(t, (stream) => respond(stream, 25))

  const pool = new Pool(origin, {
    connect: { rejectUnauthorized: false },
    allowH2: true,
    connections: 1,
    maxRequestsPerClient: 2
  })
  after(() => pool.close())

  const responses = await Promise.all(
    Array.from({ length: 7 }, () => pool.request({ path: '/', method: 'GET' }))
  )

  const bodies = await Promise.all(responses.map(response => response.body.text()))

  t.ok(responses.every(response => response.statusCode === 200))
  t.ok(bodies.every(body => body === 'hello'))
  t.ok(
    sessions.perSession.every(count => count <= 2),
    `expected no session above 2 streams, got ${JSON.stringify(sessions.perSession)}`
  )
})

test('h2 lets streams accepted before retirement finish gracefully', async t => {
  t = tspl(t, { plan: 5 })

  const { sessions, origin } = await startSecureServer(t, (stream) => respond(stream, 150))

  const client = h2Client(origin, { maxRequestsPerClient: 2 })
  after(() => client.close())

  await (await client.request({ path: '/warmup', method: 'GET' })).body.text()

  // The first of these two lands on the warmed-up session as its second (and
  // limit-reaching) stream, so it must still complete after retirement starts.
  const inFlight = Promise.all([
    client.request({ path: '/slow-a', method: 'GET' }),
    client.request({ path: '/slow-b', method: 'GET' })
  ])

  const [a, b] = await inFlight

  t.strictEqual(a.statusCode, 200)
  t.strictEqual(b.statusCode, 200)
  t.strictEqual(await a.body.text(), 'hello')
  t.strictEqual(await b.body.text(), 'hello')

  t.ok(
    sessions.perSession.every(count => count <= 2),
    `expected no session above 2 streams, got ${JSON.stringify(sessions.perSession)}`
  )
})

test('h2 requests that never open a stream do not consume the budget', async t => {
  t = tspl(t, { plan: 3 })

  const { sessions, origin } = await startSecureServer(t, (stream) => respond(stream))

  const client = h2Client(origin, { maxRequestsPerClient: 2 })
  after(() => client.close())

  await (await client.request({ path: '/a', method: 'GET' })).body.text()

  // Rejected by writeH2 before session.request() is ever reached.
  await t.rejects(
    client.upgrade({ path: '/', protocol: 'not-websocket' }),
    errors.InvalidArgumentError
  )

  await (await client.request({ path: '/b', method: 'GET' })).body.text()
  await (await client.request({ path: '/c', method: 'GET' })).body.text()

  t.deepStrictEqual(sessions.perSession, [2, 1])
  t.strictEqual(sessions.sessionCount, 2)
})

test('h2 counts an accepted stream that is later aborted', async t => {
  t = tspl(t, { plan: 3 })

  let onServerStream = null
  const serverSawStream = new Promise(resolve => { onServerStream = resolve })

  const { sessions, origin } = await startSecureServer(t, (stream, headers) => {
    if (headers[':path'] === '/aborted') {
      stream.on('error', () => {})
      onServerStream()
      return
    }

    respond(stream)
  })

  const client = h2Client(origin, { maxRequestsPerClient: 2 })
  after(() => client.close())

  const controller = new AbortController()
  const aborted = client.request({ path: '/aborted', method: 'GET', signal: controller.signal })
  const abortResult = aborted.then(() => null, err => err)

  await serverSawStream
  controller.abort()

  t.strictEqual((await abortResult)?.name, 'AbortError')

  await (await client.request({ path: '/b', method: 'GET' })).body.text()
  await (await client.request({ path: '/c', method: 'GET' })).body.text()

  t.deepStrictEqual(sessions.perSession, [2, 1])
  t.strictEqual(sessions.sessionCount, 2)
})

test('h2 counts a websocket upgrade stream and waits for it to close', async t => {
  t = tspl(t, { plan: 5 })

  const server = createSecureServer({
    ...(await pem.generate({ opts: { keySize: 2048 } })),
    settings: { enableConnectProtocol: true }
  })
  const sessions = trackSessions(server)

  server.on('stream', (stream, headers) => {
    stream.on('error', () => {})

    if (headers[':method'] === 'CONNECT') {
      stream.respond({ ':status': 200 }, { endStream: false })
      stream.resume()
      stream.once('end', () => stream.end())
      return
    }

    respond(stream)
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = h2Client(`https://localhost:${server.address().port}`, { maxRequestsPerClient: 1 })
  after(() => client.close())

  const { socket } = await client.upgrade({ path: '/', protocol: 'websocket' })
  socket.on('error', () => {})

  // The upgrade stream consumed the whole budget, so this must wait for a new
  // session rather than joining the retired one.
  const queued = client.request({ path: '/queued', method: 'GET' })

  t.strictEqual(await Promise.race([queued, sleep(300).then(() => 'pending')]), 'pending')
  t.strictEqual(sessions.sessionCount, 1)

  socket.end()

  const response = await queued
  t.strictEqual(response.statusCode, 200)
  t.strictEqual(await response.body.text(), 'hello')
  t.deepStrictEqual(sessions.perSession, [1, 1])
})

test('h2 bounds retired session draining with headersTimeout', async t => {
  t = tspl(t, { plan: 6 })

  let interval
  const { sessions, origin } = await startSecureServer(t, (stream, headers) => {
    stream.on('error', () => {})

    if (headers[':path'] === '/events') {
      stream.respond({
        ':status': 200,
        'content-type': 'text/event-stream'
      })
      stream.write('data: started\n\n')
      interval = setInterval(() => stream.write('data: keepalive\n\n'), 25).unref()
      stream.once('close', () => clearInterval(interval))
      return
    }

    respond(stream)
  })

  const client = h2Client(origin, {
    maxRequestsPerClient: 1,
    headersTimeout: 100,
    bodyTimeout: 1000
  })
  after(() => client.close())

  const events = await client.request({ path: '/events', method: 'GET' })
  t.strictEqual(events.statusCode, 200)
  const eventsError = events.body.text().then(() => null, err => err)

  const queued = client.request({ path: '/queued', method: 'GET' })
  t.strictEqual(await Promise.race([queued, sleep(50).then(() => 'pending')]), 'pending')

  const response = await queued
  t.strictEqual(response.statusCode, 200)
  t.strictEqual(await response.body.text(), 'hello')

  const err = await eventsError
  t.strictEqual(err?.code, 'UND_ERR_INFO')
  t.deepStrictEqual(sessions.perSession, [1, 1])
})

test('h2 settles every request when the peer sends GOAWAY while retiring', async t => {
  t = tspl(t, { plan: 2 })

  const seen = new Map()
  const { sessions, origin } = await startSecureServer(t, (stream) => {
    const session = stream.session
    const count = (seen.get(session) ?? 0) + 1
    seen.set(session, count)

    stream.respond({ ':status': 200 })
    stream.end('hello')

    // Race a peer GOAWAY against the client's own retirement of this session.
    if (count === 2) {
      stream.once('close', () => {
        if (!session.closed && !session.destroyed) {
          session.goaway()
        }
      })
    }
  })

  const client = h2Client(origin, { maxRequestsPerClient: 2 })
  after(() => client.close())

  const results = []
  for (let i = 0; i < 6; i++) {
    const response = await client.request({ path: `/${i}`, method: 'GET' })
    results.push(await response.body.text())
  }

  t.deepStrictEqual(results, Array.from({ length: 6 }, () => 'hello'))
  t.ok(
    sessions.perSession.every(count => count <= 2),
    `expected no session above 2 streams, got ${JSON.stringify(sessions.perSession)}`
  )
})

test('h2 destroy while a retired session is draining rejects everything', async t => {
  t = tspl(t, { plan: 3 })

  let releaseFirstStream
  const firstStreamSeen = new Promise(resolve => { releaseFirstStream = resolve })

  const { origin } = await startSecureServer(t, (stream) => {
    stream.on('error', () => {})
    releaseFirstStream()
    // Never responds, so the stream is still open when the client is destroyed.
  })

  const client = h2Client(origin, { maxRequestsPerClient: 1 })

  // Attach the rejection handlers up-front: both requests reject while
  // client.destroy() is still settling.
  const inFlight = client.request({ path: '/slow', method: 'GET' }).then(() => null, err => err)

  // Only once the session has accepted (and been retired by) the first stream
  // does the second request end up queued behind a draining session.
  await firstStreamSeen
  const queued = client.request({ path: '/queued', method: 'GET' }).then(() => null, err => err)

  await client.destroy()

  t.ok((await inFlight) instanceof errors.ClientDestroyedError)
  t.ok((await queued) instanceof errors.ClientDestroyedError)
  t.ok(true, 'destroy resolved')
})

test('h2 uploads the whole request body when retirement happens mid-upload', async t => {
  t = tspl(t, { plan: 4 })

  const chunk = Buffer.alloc(1024, 0x61)
  const chunks = 5

  const { sessions, origin } = await startSecureServer(t, (stream, headers) => {
    let received = 0
    let ended = false

    stream.on('data', (data) => { received += data.length })
    stream.on('end', () => { ended = true })
    stream.on('close', () => {
      if (headers[':path'] === '/upload') {
        t.strictEqual(received, chunk.length * chunks, 'server received the whole body')
        t.ok(ended, 'server saw the end of the body')
      }
    })

    // Respond before the body has been fully uploaded. HTTP/2 allows this, and
    // it releases the response side of the stream while the request side is
    // still open.
    stream.respond({ ':status': 200 })
    stream.end('hello')
  })

  const client = h2Client(origin, { maxRequestsPerClient: 1 })
  after(() => client.close())

  async function * body () {
    for (let i = 0; i < chunks; i++) {
      await sleep(10)
      yield chunk
    }
  }

  const response = await client.request({ path: '/upload', method: 'POST', body: body() })
  t.strictEqual(response.statusCode, 200)
  await response.body.text()

  // The next request must land on a fresh session, proving the first one really
  // was retired rather than simply never reaching the limit.
  const next = await client.request({ path: '/next', method: 'GET' })
  await next.body.text()

  t.strictEqual(sessions.sessionCount, 2)
})

test('h2 emits exactly one disconnect per retired session', async t => {
  t = tspl(t, { plan: 3 })

  const { sessions, origin } = await startSecureServer(t, (stream) => respond(stream))

  const client = h2Client(origin, { maxRequestsPerClient: 1 })
  after(() => client.close())

  let disconnects = 0
  client.on('disconnect', () => { disconnects += 1 })

  for (let i = 0; i < 3; i++) {
    const response = await client.request({ path: `/${i}`, method: 'GET' })
    await response.body.text()
  }

  t.strictEqual(sessions.sessionCount, 3)
  t.deepStrictEqual(sessions.perSession, [1, 1, 1])

  // Three sessions were used; the first two were retired and must each have
  // announced their disconnect exactly once. The third is still open.
  t.strictEqual(disconnects, 2)
})

test('h2 recovers when the peer destroys the socket while a retired session drains', async t => {
  t = tspl(t, { plan: 4 })

  const sockets = []
  let releaseFirstStream
  const firstStreamSeen = new Promise(resolve => { releaseFirstStream = resolve })

  const { server, origin } = await startCleartextServer(t, (stream, headers) => {
    stream.on('error', () => {})

    if (headers[':path'] === '/slow') {
      // Never responds: the stream is still open (and the session retired)
      // when the peer rips the transport away.
      releaseFirstStream()
      return
    }

    respond(stream)
  })

  // The raw sockets are only reachable through 'connection'; http2 forbids
  // manipulating session.socket directly.
  server.on('connection', (socket) => {
    socket.on('error', () => {})
    sockets.push(socket)
  })

  const client = new H2CClient(origin, { maxRequestsPerClient: 1 })
  after(() => client.close())

  let disconnects = 0
  client.on('disconnect', () => { disconnects += 1 })

  const inFlight = client.request({ path: '/slow', method: 'GET' }).then(() => null, err => err)

  await firstStreamSeen

  // Queued behind the now-retired session.
  const queued = client.request({ path: '/queued', method: 'GET' })

  // Abrupt transport failure, with no GOAWAY.
  for (const socket of sockets) socket.destroy()

  t.ok((await inFlight) instanceof Error, 'the in-flight request is rejected')

  const response = await queued
  t.strictEqual(response.statusCode, 200, 'the queued request runs on a new session')
  t.strictEqual(await response.body.text(), 'hello')
  t.strictEqual(disconnects, 1, 'the broken connection announced exactly one disconnect')
})
