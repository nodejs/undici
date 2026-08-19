'use strict'

const assert = require('node:assert')
const { test } = require('node:test')
const { constants, createSecureServer } = require('node:http2')
const { once } = require('node:events')
const { Readable } = require('node:stream')

const pem = require('@metcoder95/https-pem')

const { Agent } = require('..')

const skipOnNode24 = Number(process.versions.node.split('.')[0]) === 24

// completeRequestStream() runs on an h2 stream's 'close':
//
//   releaseRequestStream(this)
//   if (state.pendingEnd && !aborted && !completed) request.onResponseEnd(...)
//   finalizeRequest(state)   // frees the queue slot unconditionally
//
// There is no branch for "the stream closed with no response and no error". In
// that case the request is spliced out of the queue and nothing ever calls
// request.onResponseError(), so the caller's promise never settles -- while the
// client's own stats look perfectly healthy.
//
// The window is reachable once a GOAWAY has detached a stream:
// detachRequestStreamForClose() -> releaseRequestStream() removes the
// request-facing listeners and installs `once('error', noop)`, swallowing any
// later error, but leaves the 'close' listener and stream[kRequestStreamState]
// in place.
//
// Reproducing it needs several of those paths to interleave, so this drives a
// seeded mix of the churn a real h2 deployment produces and asserts the one
// invariant that must always hold: every request settles, one way or another.

const SEEDS = [7, 42]
const ROUNDS = 12
const CONCURRENCY = 8

function makeRandom (seed) {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

function settleOrTimeout (promise, ms, label) {
  let timer
  return Promise.race([
    promise.then(() => null, () => null),
    new Promise((resolve) => { timer = setTimeout(() => resolve(label), ms) })
  ]).finally(() => clearTimeout(timer))
}

async function churningServer (rnd) {
  const server = createSecureServer(
    await pem.generate({ opts: { keySize: 2048 } }),
    { settings: { maxConcurrentStreams: 4 } }
  )

  const actions = [
    'ok', 'ok', 'ok', 'ok', 'ok',
    'slow', 'rst-cancel', 'rst-refused', 'goaway-drain', 'goaway-refuse', 'kill-session', 'no-answer'
  ]

  server.on('stream', (stream) => {
    stream.on('error', () => {})
    const action = actions[Math.floor(rnd() * actions.length)]

    try {
      switch (action) {
        case 'ok':
          stream.respond({ ':status': 200 })
          stream.end('ok')
          break
        case 'slow':
          stream.respond({ ':status': 200 })
          setTimeout(() => { try { stream.end('slow') } catch {} }, 30)
          break
        case 'rst-cancel':
          stream.close(constants.NGHTTP2_CANCEL)
          break
        case 'rst-refused':
          stream.close(constants.NGHTTP2_REFUSED_STREAM)
          break
        case 'goaway-drain':
          // finish this stream, refuse anything newer
          stream.respond({ ':status': 200 })
          stream.end('draining')
          stream.session.goaway(constants.NGHTTP2_NO_ERROR, stream.id)
          break
        case 'goaway-refuse':
          stream.session.goaway(constants.NGHTTP2_NO_ERROR, 0)
          break
        case 'kill-session':
          stream.session.destroy()
          break
        case 'no-answer':
          break
      }
    } catch {}
  })

  // Churn (client aborts, GOAWAYs, destroyed sessions, agent.destroy()) can
  // surface a late ECONNRESET on the server, a session, or its socket after
  // the test body has resolved. An unhandled 'error' there kills the test
  // process outright -- CI then reports a bare 'test failed' with no TAP.
  // Same swallow pattern as test/http2-abort.js.
  server.on('error', () => {})
  const sessions = new Set()
  server.on('session', (session) => {
    session.on('error', () => {})
    session.socket?.on('error', () => {})
    sessions.add(session)
    session.on('close', () => sessions.delete(session))
  })
  server.on('secureConnection', socket => socket.on('error', () => {}))
  server.shutdown = () => {
    for (const session of sessions) session.destroy()
    server.close()
  }

  await once(server.listen(0), 'listening')
  return server
}

for (const seed of SEEDS) {
  test(`every h2 request settles under connection churn (seed ${seed})`, {
    skip: skipOnNode24 && 'Node.js 24 has an HTTP/2 memory corruption bug'
  }, async (t) => {
    const timer = setInterval(() => {}, 1000)
    const rnd = makeRandom(seed)
    const server = await churningServer(rnd)

    const origin = `https://localhost:${server.address().port}`
    const agent = new Agent({
      connect: { rejectUnauthorized: false },
      allowH2: true,
      headersTimeout: 500,
      bodyTimeout: 500
    })
    // Release each seed's resources before the next test starts. A file-level
    // after hook kept every TLS server and keepalive timer until all seeds had
    // finished, making this churn test sensitive to CI load.
    t.after(async () => {
      try {
        await agent.destroy()
      } finally {
        server.shutdown()
        clearInterval(timer)
      }
    })

    const unsettled = []

    for (let round = 0; round < ROUNDS && unsettled.length === 0; round++) {
      const jobs = []

      for (let i = 0; i < CONCURRENCY; i++) {
        const kind = ['get', 'get', 'post-buffer', 'post-stream', 'abort'][Math.floor(rnd() * 5)]
        const ac = new AbortController()
        const opts = { origin, path: `/r${round}-${i}`, method: 'GET', signal: ac.signal }

        if (kind === 'post-buffer') {
          opts.method = 'POST'
          opts.body = Buffer.alloc(2048, 'a')
        } else if (kind === 'post-stream') {
          opts.method = 'POST'
          opts.body = Readable.from([Buffer.alloc(512, 'b')])
        } else if (kind === 'abort') {
          setTimeout(() => ac.abort(), Math.floor(rnd() * 8))
        }

        // A dropped request is removed from the client queue outright, so not
        // even destroy() can reach it: never await these directly.
        const pending = agent.request(opts).then(res => res.body.dump(), () => {})
        // A dropped request never settles at all, so a generous watchdog costs
        // nothing in detection power and keeps this stable under a loaded CI.
        jobs.push(settleOrTimeout(pending, 15000, `/r${round}-${i}`))
      }

      for (const label of await Promise.all(jobs)) {
        if (label !== null) unsettled.push(label)
      }
    }

    await agent.destroy()

    assert.deepStrictEqual(unsettled, [], 'requests were dropped without a response and without an error')
  })
}
