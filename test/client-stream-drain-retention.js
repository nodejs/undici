'use strict'

const assert = require('node:assert/strict')
const { channel } = require('node:diagnostics_channel')
const { once } = require('node:events')
const { createServer, get } = require('node:http')
const { createSecureServer } = require('node:http2')
const { Writable } = require('node:stream')
const { test } = require('node:test')
const { setImmediate: nextTurn, setTimeout: delay } = require('node:timers/promises')

const pem = require('@metcoder95/https-pem')
const { Client } = require('..')

test('api-stream.js / stream should release unread H2 buffers when a retained ServerResponse closes', { timeout: 10000, skip: !global.gc && 'requires --expose-gc' }, async t => {
  let nativeReference
  let firstSession
  let reusedSession = false
  let sessionCount = 0
  let heldResponse
  let browser = null
  let client = null
  const sessions = new Set()
  const terminal = Promise.withResolvers()
  const userDrain = () => {}
  const created = channel('http2.client.stream.created')
  const onCreated = ({ stream, headers }) => {
    if (headers[':path'] === '/cancel') {
      nativeReference = new WeakRef(stream)
      firstSession = stream.session
    } else {
      reusedSession = stream.session === firstSession
    }
  }
  created.subscribe(onCreated)

  const upstream = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  upstream.on('session', session => {
    sessionCount++
    sessions.add(session)
    session.on('error', () => {})
    session.once('close', () => sessions.delete(session))
  })
  upstream.on('stream', (stream, headers) => {
    stream.on('error', () => {})
    stream.respond({ ':status': 200 })
    if (headers[':path'] !== '/cancel') {
      stream.end('healthy')
      return
    }
    const chunk = Buffer.alloc(16 * 1024)
    let remaining = 2 * 1024 * 1024
    const write = () => {
      while (!stream.destroyed && remaining > 0) {
        remaining -= chunk.length
        if (!stream.write(chunk)) {
          stream.once('drain', write)
          return
        }
      }
      if (!stream.destroyed) stream.end()
    }
    write()
  })

  const downstream = createServer((request, response) => {
    // The response deliberately outlives the request, as an application owner may.
    heldResponse = response
    response.on('drain', userDrain)
    client.stream({ path: '/cancel', method: 'GET' }, () => response)
      .then(() => terminal.resolve(null), error => terminal.resolve(error.code))
  })

  t.after(async () => {
    created.unsubscribe(onCreated)
    browser?.destroy()
    heldResponse?.destroy()
    firstSession?.destroy()
    for (const session of sessions) session.destroy()
    await client?.destroy()
    downstream.closeAllConnections()
    await Promise.all([closeServer(downstream), closeServer(upstream)])
  })
  await once(upstream.listen(0, '127.0.0.1'), 'listening')
  client = new Client(`https://127.0.0.1:${upstream.address().port}`, {
    allowH2: true,
    connect: { rejectUnauthorized: false }
  })
  await once(downstream.listen(0, '127.0.0.1'), 'listening')
  browser = get(`http://127.0.0.1:${downstream.address().port}`)
  browser.on('error', () => {})
  browser.on('response', response => {
    response.on('error', () => {})
    response.pause()
  })

  await waitFor(() => heldResponse?.writableNeedDrain && unreadBytes(nativeReference) > 0)
  const unreadBeforeAbort = unreadBytes(nativeReference)
  browser.destroy()
  assert.equal(await bounded(terminal.promise), 'ERR_STREAM_PREMATURE_CLOSE')
  await collect()
  const unreadAfterTerminal = unreadBytes(nativeReference)
  const ownedDrainCount = heldResponse.listeners('drain').filter(listener => listener !== userDrain).length

  // This causal control changes only the retained response's request-owned listener.
  // It must release the unread native stream without closing the reused H2 session.
  removeRequestDrain(heldResponse, userDrain)
  await collect()
  const unreadAfterListenerRemoval = unreadBytes(nativeReference)
  assert.equal(unreadAfterListenerRemoval, 0)
  assert.deepEqual(heldResponse.listeners('drain'), [userDrain])

  let healthyBody = ''
  const healthy = new Writable({
    write (chunk, encoding, callback) {
      healthyBody += chunk.toString()
      callback()
    }
  })
  healthy.on('drain', userDrain)
  await bounded(client.stream({ path: '/healthy', method: 'GET' }, () => healthy))
  assert.equal(healthyBody, 'healthy')
  assert.equal(reusedSession, true)
  assert.equal(sessionCount, 1)
  const healthyOwnedDrainCount = healthy.listeners('drain').filter(listener => listener !== userDrain).length

  t.diagnostic(JSON.stringify({ unreadBeforeAbort, unreadAfterTerminal, unreadAfterListenerRemoval, ownedDrainCount, healthyOwnedDrainCount, sessionCount, reusedSession }))
  assert.equal(ownedDrainCount, 0, 'a terminal request must remove its own drain listener')
  assert.equal(unreadAfterTerminal, 0, 'a retained response must not retain unread native buffers')
  assert.deepEqual(healthy.listeners('drain'), [userDrain])
  const closed = once(firstSession, 'close')
  firstSession.close()
  await bounded(closed)
})

function unreadBytes (reference) {
  return reference?.deref()?.readableLength || 0
}

function removeRequestDrain (response, userDrain) {
  for (const listener of response.listeners('drain')) {
    if (listener !== userDrain) response.removeListener('drain', listener)
  }
}

async function collect () {
  for (let i = 0; i < 3; i++) {
    await nextTurn()
    global.gc()
  }
  await nextTurn()
}

async function waitFor (predicate) {
  const deadline = Date.now() + 3000
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'the fixture must reach native unread bytes and downstream backpressure')
    await delay(10)
  }
}

async function bounded (promise) {
  let timer
  try {
    return await Promise.race([promise, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('fixture timed out')), 2000) })])
  } finally {
    clearTimeout(timer)
  }
}

async function closeServer (server) {
  if (!server.listening) return
  const closed = once(server, 'close')
  server.close()
  await bounded(closed)
}
