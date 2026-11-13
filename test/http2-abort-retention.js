'use strict'

const assert = require('node:assert/strict')
const { channel } = require('node:diagnostics_channel')
const { once } = require('node:events')
const { createSecureServer } = require('node:http2')
const { Writable } = require('node:stream')
const { test } = require('node:test')
const { setTimeout: delay } = require('node:timers/promises')

const pem = require('@metcoder95/https-pem')
const { Client } = require('..')

test('should release unread H2 response streams and reuse their session when the destination closes under backpressure', { timeout: 8000 }, async t => {
  const sessions = new Set()
  let sessionCount = 0
  let requests = 0
  let firstNative
  let firstSession
  let reusedSession = false
  const nativeClosed = Promise.withResolvers()
  const clientSessionClosed = Promise.withResolvers()
  const wroteResponse = Promise.withResolvers()
  const bodyBytes = 256 * 1024
  const observation = { bodyBytes, unreadBeforeAbort: 0, requests: 0, sessionCount: 0, reusedSession: false, abortedCode: null, healthyStatus: null, nativeClosed: false, gracefulClosed: false }
  const created = channel('http2.client.stream.created')
  const onCreated = ({ stream, headers }) => {
    if (headers[':path'] === '/abort-retention') {
      firstNative = new WeakRef(stream)
      firstSession = stream.session
      stream.once('close', () => {
        observation.nativeClosed = true
        nativeClosed.resolve()
      })
      firstSession.once('close', () => {
        observation.gracefulClosed = true
        clientSessionClosed.resolve()
      })
    } else if (headers[':path'] === '/healthy-retention') {
      reusedSession = stream.session === firstSession
    }
  }
  created.subscribe(onCreated)

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  server.on('error', () => {})
  server.on('secureConnection', socket => socket.on('error', () => {}))
  server.on('session', session => {
    sessionCount++
    sessions.add(session)
    session.on('error', () => {})
    session.once('close', () => sessions.delete(session))
  })
  server.on('stream', (stream, headers) => {
    requests++
    stream.on('error', () => {})
    stream.respond({ ':status': 200 })
    stream.end(headers[':path'] === '/abort-retention' ? Buffer.alloc(bodyBytes) : 'healthy')
  })

  let client = null
  t.after(async () => {
    observation.requests = requests
    observation.sessionCount = sessionCount
    observation.reusedSession = reusedSession
    t.diagnostic(JSON.stringify(observation))
    created.unsubscribe(onCreated)
    firstSession?.destroy()
    for (const session of sessions) session.destroy()
    client?.destroy().catch(() => {})
    if (server.listening) {
      const closed = once(server, 'close')
      server.close()
      await bounded(closed, 1000, 'fixture cleanup timed out')
    }
  })
  await once(server.listen(0, '127.0.0.1'), 'listening')
  client = new Client(`https://127.0.0.1:${server.address().port}`, {
    allowH2: true,
    connect: { rejectUnauthorized: false }
  })

  const destination = new Writable({
    highWaterMark: 1,
    write (chunk, encoding, callback) {
      wroteResponse.resolve()
      // Leaving this write pending gives the consumer real backpressure.
    }
  })
  const abortedResponse = client.stream({ path: '/abort-retention', method: 'GET' }, () => destination)
    .then(() => null, error => error.code)
  await bounded(wroteResponse.promise, 2000, 'response body did not reach destination')
  const deadline = Date.now() + 2000
  while ((observation.unreadBeforeAbort = unreadBytes(firstNative)) === 0 && Date.now() < deadline) {
    await delay(10)
  }
  assert.ok(observation.unreadBeforeAbort > 0, 'the native response must contain unread bytes before abort')
  destination.destroy()
  observation.abortedCode = await bounded(abortedResponse, 1000, 'destination close did not settle the request')
  assert.equal(observation.abortedCode, 'ERR_STREAM_PREMATURE_CLOSE')

  let healthyBody = ''
  const healthy = await bounded(client.stream({ path: '/healthy-retention', method: 'GET' }, ({ statusCode }) => {
    observation.healthyStatus = statusCode
    assert.equal(statusCode, 200)
    return new Writable({
      write (chunk, encoding, callback) {
        healthyBody += chunk.toString()
        callback()
      }
    })
  }), 2000, 'healthy request did not settle')
  assert.ok(healthy)
  assert.equal(healthyBody, 'healthy')
  assert.equal(requests, 2)
  assert.equal(sessionCount, 1)
  assert.equal(reusedSession, true)

  await bounded(nativeClosed.promise, 1000, 'aborted native response remained attached after a healthy request')
  firstSession.close()
  await bounded(clientSessionClosed.promise, 1000, 'the reused H2 session did not close gracefully')
})

function unreadBytes (reference) {
  return reference?.deref()?.readableLength || 0
}

async function bounded (promise, millis, message) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error(message)), millis) })
    ])
  } finally {
    clearTimeout(timer)
  }
}
