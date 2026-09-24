'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { createReadStream } = require('node:fs')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')
const { kHTTP2Session } = require('../lib/core/symbols')

test('Should handle http2 stream timeout', async t => {
  t = tspl(t, { plan: 1 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  const stream = createReadStream(__filename)

  server.on('stream', (stream, headers) => {
    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': headers['x-my-header'],
      ':status': 200
    })

    setTimeout(() => {
      stream.end('hello h2!')
    }, 500)
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true,
    bodyTimeout: 50
  })
  after(() => client.close())

  const res = await client.request({
    path: '/',
    method: 'PUT',
    headers: {
      'x-my-header': 'foo'
    },
    body: stream
  })

  await t.rejects(res.body.text(), {
    message: 'HTTP/2: "stream timeout after 50"'
  })

  await t.completed
})

// Regression for the double-decrement of kOpenStreams on stream timeout.
// Both the 'timeout' handler and the 'close' handler used to decrement the
// counter, so after a single timeout kOpenStreams became -1. The follow-up
// request then pre-incremented it to 0 and the client treated the session as
// idle, which produced "unref called on already-unrefed session" style
// regressions in downstream code. With the fix only 'close' decrements, so
// the counter stays accurate and a subsequent request on the same client
// completes normally.
test('http2 stream timeout keeps open-stream counter non-negative', async t => {
  t = tspl(t, { plan: 5 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('stream', (stream) => {
    // Respond with headers but hold the body long enough for the client
    // bodyTimeout to fire.
    stream.respond({ ':status': 200, 'content-type': 'text/plain' })
    setTimeout(() => {
      try { stream.end('late') } catch {}
    }, 500)
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: { rejectUnauthorized: false },
    allowH2: true,
    bodyTimeout: 50,
    pipelining: 1
  })
  after(() => client.close())

  // Drive three sequential request timeouts on the same h2 session. Each one
  // should leave the open-stream counter at 0, not at a negative value.
  for (let i = 0; i < 3; i++) {
    const req = await client.request({ path: `/timeout-${i}`, method: 'GET' })
    await t.rejects(req.body.text(), {
      message: 'HTTP/2: "stream timeout after 50"'
    })
    // Let the stream's 'close' event run before the next iteration so the
    // close handler has had a chance to update the counter.
    await new Promise(resolve => setImmediate(resolve))
  }

  // Locate the open-stream counter on the session by its Symbol description.
  // The Symbol itself is module-local to client-h2.js and not exported, so
  // this is the only stable way to observe the counter value from a test.
  const session = client[kHTTP2Session]
  const openStreamsSymbol = Object.getOwnPropertySymbols(session)
    .find(sym => sym.description === 'open streams')

  t.ok(openStreamsSymbol, 'open-streams symbol must exist on the h2 session')
  // Before the fix each timed-out stream ran both the 'timeout' and 'close'
  // decrement paths, so after three cycles the counter drifted to -3. With
  // only the 'close' handler decrementing, it returns to 0 after each
  // request completes.
  t.equal(session[openStreamsSymbol], 0,
    `open-stream counter should be 0 after all streams close, got ${session[openStreamsSymbol]}`)

  await t.completed
})

// bodyTimeout measures how long the peer takes to send the body. While the
// consumer applies backpressure, the peer runs out of flow-control window and
// can't send, so the timeout must not fire. HTTP/1.1 behaves the same way.
// Once the consumer resumes, a fresh bodyTimeout applies.
async function startBodyServer (t, respond) {
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  server.on('stream', (stream) => {
    stream.on('error', () => {})
    stream.respond({ ':status': 200 })
    respond(stream)
  })
  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: { rejectUnauthorized: false },
    allowH2: true,
    bodyTimeout: 100
  })
  after(() => client.destroy())
  return client
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('http2 bodyTimeout does not fire while the consumer applies backpressure', { timeout: 5000 }, async t => {
  // More than the 64 KiB flow-control window, sent at once.
  const size = 2 * 1024 * 1024
  const client = await startBodyServer(t, (stream) => stream.end(Buffer.alloc(size, 'a')))

  const res = await client.request({ path: '/', method: 'GET' })
  // Don't read the body for several bodyTimeouts. The body stream fills up
  // and pauses the HTTP/2 stream.
  await sleep(400)

  const body = await res.body.text()
  t.assert.strictEqual(body.length, size)
})

test('http2 bodyTimeout does not fire while a controller-API handler is paused', { timeout: 5000 }, async t => {
  const size = 2 * 1024 * 1024
  const client = await startBodyServer(t, (stream) => stream.end(Buffer.alloc(size, 'a')))

  const { promise, resolve, reject } = Promise.withResolvers()
  let received = 0
  let pausedOnce = false
  client.dispatch({ path: '/', method: 'GET' }, {
    onRequestStart () {},
    onResponseStart () {},
    onResponseData (controller, chunk) {
      received += chunk.length
      if (!pausedOnce) {
        pausedOnce = true
        controller.pause()
        setTimeout(() => controller.resume(), 400)
      }
    },
    onResponseEnd () { resolve(received) },
    onResponseError (controller, err) { reject(err) }
  })

  t.assert.strictEqual(await promise, size)
})

test('http2 bodyTimeout applies again after the consumer resumes', { timeout: 5000 }, async t => {
  // Fill the window, then stall without ending the stream.
  const client = await startBodyServer(t, (stream) => stream.write(Buffer.alloc(1024 * 1024, 'a')))

  const res = await client.request({ path: '/', method: 'GET' })
  await sleep(400)

  const readStart = Date.now()
  await t.assert.rejects(res.body.text(), {
    code: 'UND_ERR_BODY_TIMEOUT',
    message: 'HTTP/2: "stream timeout after 100"'
  })
  // The timeout is measured from the resume, not from the pause: it must
  // not have fired while paused (which rejects as soon as reading starts).
  const elapsed = Date.now() - readStart
  t.assert.ok(elapsed >= 50, `timed out ${elapsed}ms after resuming, expected about 100ms`)
})
