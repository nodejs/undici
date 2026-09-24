'use strict'

// The connector's TLS session cache holds sessions through WeakRefs. When the
// cache is full and an entry's session has been collected, that dead entry
// should make room for the new session, without discarding the new session
// or evicting a live one.
//
// tls.connect is stubbed so the test controls the session objects, and so
// when they can be collected.

const { test, afterEach } = require('node:test')
const assert = require('node:assert')
const tls = require('node:tls')
const v8 = require('node:v8')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const { setImmediate: tick, setTimeout: sleep } = require('node:timers/promises')
const { buildConnector } = require('..')

v8.setFlagsFromString('--expose-gc')
const gc = vm.runInNewContext('gc')

const originalConnect = tls.connect
afterEach(() => {
  tls.connect = originalConnect
})

function stubConnector (opts) {
  const offered = []
  let socket
  tls.connect = (options) => {
    offered.push(options.session)
    socket = new EventEmitter()
    socket.setKeepAlive = () => socket
    socket.setNoDelay = () => socket
    socket.destroy = () => socket
    return socket
  }

  const connector = buildConnector({ timeout: 0, ...opts })
  return {
    // Opens a connection and returns the session offered for resumption.
    connect (hostname) {
      connector({ hostname, host: hostname, protocol: 'https:', port: 443 }, () => {})
      return offered.at(-1)
    },
    // Emits a new session on the most recent connection.
    session (session) {
      socket.emit('session', session)
    }
  }
}

// Returns once `session` has been collected, keeping the cache entry.
// Finalization callbacks run in a later task than gc(), so the caller can
// act on the dead entry before the FinalizationRegistry sees it.
async function collect (makeSession) {
  let ref
  ;(() => { ref = new WeakRef(makeSession()) })()
  await tick()
  gc()
  assert.strictEqual(ref.deref(), undefined, 'session was collected')
}

test('a full cache replaces a collected entry with the new session', async () => {
  const cache = stubConnector({ maxCachedSessions: 2 })

  const sessionA = { name: 'A' }
  cache.connect('a.test')
  cache.session(sessionA)

  await collect(() => {
    const sessionB = { name: 'B' }
    cache.connect('b.test')
    cache.session(sessionB)
    return sessionB
  })

  const sessionC = { name: 'C' }
  cache.connect('c.test')
  cache.session(sessionC)

  assert.strictEqual(cache.connect('c.test'), sessionC, 'new session is cached')
  assert.strictEqual(cache.connect('a.test'), sessionA, 'live session is kept')
})

test('a collected entry left behind while the cache had room is replaced once it fills', async () => {
  const cache = stubConnector({ maxCachedSessions: 2 })

  await collect(() => {
    const sessionA = { name: 'A' }
    cache.connect('a.test')
    cache.session(sessionA)
    return sessionA
  })
  // Let the FinalizationRegistry run. The cache is below its limit, so it
  // leaves the dead entry in place.
  await sleep(20)

  const sessionB = { name: 'B' }
  cache.connect('b.test')
  cache.session(sessionB)

  const sessionC = { name: 'C' }
  cache.connect('c.test')
  cache.session(sessionC)

  assert.strictEqual(cache.connect('c.test'), sessionC, 'new session is cached')
  assert.strictEqual(cache.connect('b.test'), sessionB, 'live session is kept')
})

test('a full cache with no collected entries evicts the oldest session', async () => {
  const cache = stubConnector({ maxCachedSessions: 2 })

  const sessions = { a: { name: 'A' }, b: { name: 'B' }, c: { name: 'C' } }
  for (const key of ['a', 'b', 'c']) {
    cache.connect(`${key}.test`)
    cache.session(sessions[key])
  }

  assert.strictEqual(cache.connect('a.test'), null, 'oldest session evicted')
  assert.strictEqual(cache.connect('b.test'), sessions.b)
  assert.strictEqual(cache.connect('c.test'), sessions.c)
})
