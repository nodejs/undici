'use strict'

const assert = require('node:assert')
const { once } = require('node:events')
const { createSecureServer } = require('node:http2')
const { setTimeout: sleep } = require('node:timers/promises')
const { test } = require('node:test')
const pem = require('@metcoder95/https-pem')

const { Client } = require('..')
const { kHTTP2Session } = require('../lib/core/symbols.js')

// Node keeps every live native stream in the session's internal state, and only
// drops the entry once the stream fully closes. A stream that has fired 'end'
// (so undici releases it via completeRequestStream) is still tracked here during
// the window between 'end' and 'close'. The HTTP/2 idle reaper (#5406) can
// destroy such a session with an error in this window, and Node fans that error
// out to every still-tracked stream. If a released stream has no 'error'
// listener the process crashes (#5936).
function sessionStreams (client) {
  const session = client[kHTTP2Session]
  if (session == null) {
    return []
  }

  for (const sym of Object.getOwnPropertySymbols(session)) {
    const state = session[sym]
    if (state && typeof state === 'object' && state.streams) {
      return [...state.streams.values()]
    }
  }

  return []
}

async function waitFor (predicate, timeout = 1000) {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    if (predicate()) {
      return true
    }

    await sleep(0)
  }

  return predicate()
}

test('Issue #5936 - released streams retain an error sink so the idle reaper cannot crash', async (t) => {
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  server.on('error', () => {})
  server.on('session', (session) => {
    session.on('error', () => {})
  })
  server.on('stream', (stream) => {
    stream.on('error', () => {})
    stream.respond({ ':status': 200 })
    stream.end('hello')
  })

  t.after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    allowH2: true,
    connect: {
      rejectUnauthorized: false
    }
  })
  t.after(() => client.close())

  const response = await client.request({ path: '/', method: 'GET' })
  await response.body.dump()

  // 'end' has fired, so undici released the stream and it is still natively
  // tracked during the 'end' -> 'close' window. On some platforms this window is
  // too short to observe (the stream closes before we can inspect it), in which
  // case the teardown race that this issue describes cannot manifest either.
  const found = await waitFor(() => sessionStreams(client).length === 1, 50)
  if (!found) {
    t.skip('idle-teardown window not observable; released stream already closed')
    return
  }

  const stream = sessionStreams(client)[0]

  // A released stream must keep a persistent error sink. If it only installed a
  // one-shot sink, a first late error would consume it and a second session-level
  // error (as the idle reaper emits) would be delivered with no listener, which
  // crashes the process.
  assert.strictEqual(stream.listenerCount('error'), 1)

  // Simulate the first late error (e.g. a late RST_STREAM / frame error) that
  // arrives after undici has finished with the request.
  stream.emit('error', new Error('late stream error'))
  assert.strictEqual(stream.listenerCount('error'), 1)

  // Tear down the session with an error exactly like onHttp2SessionIdleTimeout:
  // Node fans the error out to every still-tracked stream. With the persistent
  // sink the process keeps running; a one-shot sink would already be consumed
  // and trigger an unhandled 'error'.
  client[kHTTP2Session].destroy(new Error('socket idle timeout'))

  // The session error is delivered asynchronously; give the stream a chance to
  // be destroyed with it before asserting the process survived.
  await sleep(50)
})
