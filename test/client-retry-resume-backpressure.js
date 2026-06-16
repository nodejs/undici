'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { Writable } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const { once } = require('node:events')
const { Agent, RetryAgent, request } = require('..')

const TOTAL = 4 * 1024 * 1024
const PART = 1 * 1024 * 1024
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Both tests exercise the RetryHandler controller-proxy fix. A download is
// interrupted mid-body with a retryable error (ECONNRESET); RetryAgent
// transparently resumes it with a Range request on a NEW connection. Before the
// fix the downstream body kept flow-controlling the ORIGINAL (now-dead)
// connection's controller while data/pause flowed on the new one, so:
//   - under backpressure the resumed body paused and was never resumed (it hung);
//   - an abort hit the dead original instead of the live resumed connection.
// With the fix both follow the active connection.

// Faithful reproduction of the reported hang. If the bug returns, pipeline()
// never resolves and the test is failed by the runner timeout (the npm scripts
// run borp with --timeout). Note: `node --test --test-timeout=0` disables that
// timeout, so run this under the npm test scripts.
test('RetryAgent resumes a backpressured body after a mid-stream connection drop', async (t) => {
  t = tspl(t, { plan: 3 })

  let requests = 0
  const server = createServer((req, res) => {
    requests++
    if (!req.headers.range) {
      res.writeHead(200, { 'content-length': String(TOTAL) })
      res.write(Buffer.alloc(PART))
      setTimeout(() => res.socket.resetAndDestroy(), 100)
    } else {
      const start = Number(/bytes=(\d+)-/.exec(req.headers.range)[1])
      res.writeHead(206, {
        'content-range': `bytes ${start}-${TOTAL - 1}/${TOTAL}`,
        'content-length': String(TOTAL - start)
      })
      res.end(Buffer.alloc(TOTAL - start))
    }
  })
  after(() => server.close())
  server.listen(0)
  await once(server, 'listening')

  const dispatcher = new RetryAgent(new Agent(), { maxRetries: 5, minTimeout: 100, timeoutFactor: 1 })
  after(() => dispatcher.close())

  const { statusCode, body } = await request(`http://localhost:${server.address().port}`, { dispatcher })
  t.strictEqual(statusCode, 200)

  // Slow consumer -> sustained backpressure on the resumed connection (the trigger).
  let received = 0
  const slow = new Writable({
    highWaterMark: 16 * 1024,
    write (chunk, enc, cb) { received += chunk.length; setTimeout(cb, 5) }
  })

  await pipeline(body, slow) // before the fix this never resolves

  t.strictEqual(received, TOTAL)
  t.ok(requests >= 2, 'the download was actually resumed on a new connection')

  await t.completed
})

// Companion check on the abort path. A flowing consumer keeps the resumed
// connection in-flight (no backpressure pause), then aborts. The server-side
// socket of the resumed connection must close: with the fix the abort reaches
// the live connection; before it, it hit the dead original and the resumed
// socket leaked. Bounded so a regression fails fast instead of waiting.
test('RetryAgent aborts the resumed connection (not the dead original) after a drop', async (t) => {
  t = tspl(t, { plan: 2 })

  let resumeSocket = null
  let onResume
  const resumed = new Promise(resolve => { onResume = resolve })

  const server = createServer((req, res) => {
    if (!req.headers.range) {
      res.writeHead(200, { 'content-length': String(TOTAL) })
      res.write(Buffer.alloc(PART))
      setTimeout(() => res.socket.resetAndDestroy(), 100)
    } else {
      resumeSocket = res.socket
      const start = Number(/bytes=(\d+)-/.exec(req.headers.range)[1])
      res.writeHead(206, {
        'content-range': `bytes ${start}-${TOTAL - 1}/${TOTAL}`,
        'content-length': String(TOTAL - start)
      })
      res.write(Buffer.alloc(64 * 1024)) // keep the resumed connection in-flight
      onResume()
    }
  })
  after(() => server.close())
  server.listen(0)
  await once(server, 'listening')

  const dispatcher = new RetryAgent(new Agent(), { maxRetries: 5, minTimeout: 100, timeoutFactor: 1 })
  after(() => dispatcher.destroy())

  const ac = new AbortController()
  const { statusCode, body } = await request(`http://localhost:${server.address().port}`, { dispatcher, signal: ac.signal })
  t.strictEqual(statusCode, 200)

  body.on('data', () => {}).on('error', () => {}) // flowing consumer; swallow the abort error

  await resumed // downloading on the resumed (206) connection now
  await sleep(50) // let a little data flow on it

  const closed = once(resumeSocket, 'close') // attach before aborting
  ac.abort()

  let timer
  const bound = new Promise(resolve => { timer = setTimeout(() => resolve(false), 4000) })
  const wasClosed = await Promise.race([closed.then(() => true), bound])
  clearTimeout(timer)

  t.ok(wasClosed, 'aborting closed the resumed connection, not the dead original')

  await t.completed
})
