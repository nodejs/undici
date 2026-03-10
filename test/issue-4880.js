'use strict'

// Regression test for: "Cannot read properties of null (reading 'push')"
//
// Stack trace:
//   TypeError: Cannot read properties of null (reading 'push')
//   at RequestHandler.onData (lib/api/api-request.js:148:21)
//   at ClientHttp2Stream.<anonymous> (lib/dispatcher/client-h2.js:706:17)
//
// Root cause:
//   The 'data' listener was registered unconditionally on the stream, outside
//   the 'response' handler. This meant 'data' events could fire before 'response',
//   i.e. before onHeaders() ran and set RequestHandler.res. With res still null
//   (its initial value), onData() -> this.res.push(chunk) crashed.
//
//   Fix: register the 'data' listener only inside the 'response' handler, after
//   onHeaders() has run and res is guaranteed to be set. A closure-local
//   dataHandlerActive flag additionally guards against already-queued 'data'
//   events that arrive after abort() tears down the stream.
//
// Reproduced by: TLS H2 server with slow responses (2.5s), 20 connections x 100
// concurrent streams = 2000 max concurrent, 10k total requests queued. Under this
// backpressure undici dispatches data events before response headers are processed.

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Worker, isMainThread, parentPort } = require('node:worker_threads')
const { Agent, interceptors } = require('..')

// ── Server (runs in worker thread) ──────────────────────────────────────────
if (!isMainThread) {
  const http2 = require('node:http2')
  const pem = require('@metcoder95/https-pem')

  pem.generate({ opts: { keySize: 2048 } }).then((cert) => {
    const body = JSON.stringify({ ok: true })
    const server = http2.createSecureServer({ key: cert.key, cert: cert.cert, allowHTTP1: false })

    server.on('stream', (stream, headers) => {
      const path = headers[':path'] ?? ''
      if (path.startsWith('/slow')) {
        const url = new URL(path, 'https://localhost')
        const delayMs = parseInt(url.searchParams.get('delayMs') ?? '2500')
        setTimeout(() => {
          stream.respond({ ':status': 200, 'content-type': 'application/json' })
          stream.end(body)
        }, delayMs)
      } else {
        stream.respond({ ':status': 200, 'content-type': 'application/json' })
        stream.end(body)
      }
    })

    server.listen(0, '127.0.0.1', () => {
      parentPort.postMessage({ port: server.address().port })
    })
  })
}

// ── Client / tests (runs in main thread) ────────────────────────────────────

function startServer () {
  return new Promise((resolve) => {
    const worker = new Worker(__filename)
    worker.once('message', ({ port }) => resolve({ worker, port }))
  })
}

function makeDispatcher (connections, maxConcurrentStreams) {
  return new Agent({
    keepAliveTimeout: 20_000,
    keepAliveMaxTimeout: 60_000,
    bodyTimeout: 20_000,
    headersTimeout: 20_000,
    allowH2: true,
    connections,
    pipelining: maxConcurrentStreams,
    maxConcurrentStreams,
    connect: { rejectUnauthorized: false }
  }).compose(interceptors.responseError())
}

// Integration test:  TLS H2 server in a worker thread, slow responses (2.5s),
// 20 connections x 100 streams = 2000 concurrent max, 10k total requests queued, responseError interceptor active.
test('h2: no crash when data arrives after stream abort under high concurrency', async (t) => {
  t = tspl(t, { plan: 2 })

  const { worker, port } = await startServer()
  after(() => worker.terminate())

  const connections = 20
  const maxConcurrentStreams = 100
  const dispatcher = makeDispatcher(connections, maxConcurrentStreams)
  after(() => dispatcher.close())

  const origin = `https://127.0.0.1:${port}`
  const count = 10_000

  const requests = Array.from({ length: count }, () =>
    dispatcher.request({
      origin,
      path: '/slow?delayMs=2500',
      method: 'GET'
    }).then((res) => res.body.dump())
  )

  const results = await Promise.allSettled(requests)

  const errors = results.filter((r) => r.status === 'rejected')
  const successCount = results.length - errors.length

  if (errors.length > 0) {
    const groups = new Map()
    for (const e of errors) {
      const msg = e.reason?.message ?? String(e.reason)
      groups.set(msg, (groups.get(msg) ?? 0) + 1)
    }
    console.log('Error breakdown:', Object.fromEntries(groups))
    console.log('First error stack:\n', errors[0].reason?.stack)
  }

  // If the bug is present, some requests crash with:
  // "Cannot read properties of null (reading 'push')"
  t.ok(successCount + errors.length === count, `all ${count} requests settled`)
  t.ok(successCount === count, `all ${count} requests succeeded (got ${errors.length} errors)`)

  await t.completed
})
