'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { Writable, pipeline } = require('node:stream')
const { once } = require('node:events')
const { Client, errors } = require('..')

// A server that writes `burst` bytes and then stays silent forever: the socket
// is kept open, with no further data and no `end`/FIN — a stalled / half-open
// upstream. The Content-Length is much larger than what is sent so the client
// keeps waiting for body that never arrives.
function createStallingServer (burst = 4 * 1024 * 1024) {
  return createServer((req, res) => {
    // Claim far more than we send so the client keeps waiting for body, and send
    // a burst large enough that the (never-draining) consumer forces the parser
    // into the `paused` state — exactly where `bodyTimeout` is suppressed.
    res.writeHead(200, { 'content-length': String(128 * 1024 * 1024) })
    res.write(Buffer.alloc(burst))
    // then stall: never write again, never end
  })
}

function listen (server) {
  return new Promise((resolve) => {
    server.listen(0, () => resolve(`http://localhost:${server.address().port}`))
  })
}

// A consumer that never invokes its write callback -> permanent backpressure ->
// the parser is `paused`, which is exactly where the regular `bodyTimeout` is
// intentionally suppressed.
function blockedSink () {
  return new Writable({ highWaterMark: 1, write () {} })
}

test('bodyIdleTimeout fires on a stalled body even while the consumer is paused', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createStallingServer()
  after(() => server.close())
  const url = await listen(server)

  const client = new Client(url, { bodyIdleTimeout: 500 })
  after(() => client.destroy())

  const { body } = await client.request({ path: '/', method: 'GET' })
  body.pipe(blockedSink())

  const started = Date.now()
  const [err] = await once(body, 'error')
  t.strictEqual(err.code, 'UND_ERR_BODY_TIMEOUT')
  t.ok(Date.now() - started < 4000, 'failed fast instead of hanging')

  await t.completed
})

test('per-request bodyIdleTimeout is honored', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createStallingServer()
  after(() => server.close())
  const url = await listen(server)

  const client = new Client(url) // no client-level bodyIdleTimeout
  after(() => client.destroy())

  const { body } = await client.request({ path: '/', method: 'GET', bodyIdleTimeout: 500 })
  body.pipe(blockedSink())

  const [err] = await once(body, 'error')
  t.strictEqual(err.code, 'UND_ERR_BODY_TIMEOUT')

  await t.completed
})

test('without bodyIdleTimeout a stalled paused body is not timed out (opt-in / back-compat)', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createStallingServer()
  after(() => server.close())
  const url = await listen(server)

  // Only bodyTimeout is set; bodyIdleTimeout defaults to 0 (disabled). The
  // existing behaviour is preserved: while the parser is paused by backpressure
  // the body timeout is suppressed, so nothing fires.
  const client = new Client(url, { bodyTimeout: 300 })
  after(() => client.destroy())

  const { body } = await client.request({ path: '/', method: 'GET' })
  body.pipe(blockedSink())

  let errored = false
  body.on('error', () => { errored = true })

  await new Promise((resolve) => setTimeout(resolve, 1500)) // 5x bodyTimeout
  t.strictEqual(errored, false, 'bodyTimeout remains suppressed while paused (unchanged)')

  await t.completed
})

test('bodyIdleTimeout does not abort a slow but progressing consumer', async (t) => {
  t = tspl(t, { plan: 1 })

  const CHUNK = 64 * 1024
  const CHUNKS = 8

  // Server streams steadily with gaps well under the idle budget, then ends.
  const server = createServer((req, res) => {
    res.writeHead(200)
    let i = 0
    const tick = () => {
      if (i++ < CHUNKS) {
        res.write(Buffer.alloc(CHUNK))
        setTimeout(tick, 150)
      } else {
        res.end()
      }
    }
    tick()
  })
  after(() => server.close())
  const url = await listen(server)

  const client = new Client(url, { bodyIdleTimeout: 1000 })
  after(() => client.destroy())

  const { body } = await client.request({ path: '/', method: 'GET' })

  // Slow consumer that always drains (delay < idle budget) -> backpressure, but
  // the socket keeps delivering bytes within the budget, so it must NOT abort.
  let received = 0
  const slow = new Writable({
    highWaterMark: 16 * 1024,
    write (chunk, enc, cb) { received += chunk.length; setTimeout(cb, 100) }
  })

  await new Promise((resolve, reject) => {
    pipeline(body, slow, (err) => (err ? reject(err) : resolve()))
  })

  t.strictEqual(received, CHUNK * CHUNKS, 'full body received, no spurious idle timeout')

  await t.completed
})

test('invalid bodyIdleTimeout throws', async (t) => {
  t = tspl(t, { plan: 3 })
  t.throws(() => new Client('http://localhost', { bodyIdleTimeout: -1 }), errors.InvalidArgumentError)
  t.throws(() => new Client('http://localhost', { bodyIdleTimeout: 1.5 }), errors.InvalidArgumentError)
  t.throws(() => new Client('http://localhost', { bodyIdleTimeout: 'nope' }), errors.InvalidArgumentError)
  await t.completed
})
