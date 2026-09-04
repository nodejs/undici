'use strict'

// Regression test for https://github.com/nodejs/undici/issues/4068
//
// A cloned (or constructor-copied) Request must keep respecting its abort
// signal after a garbage collection. The follow linkage that ties the clone's
// signal to the source signal used to be reachable only through weak references
// (dependentControllerMap / WeakRef), so once GC ran the controller chain was
// collected and aborting the source no longer aborted the in-flight fetch,
// which then hung until the timeout guard fired.
//
// This test is GC-sensitive, so it must be run deterministically with
// `--expose-gc` and it forces `global.gc()` itself rather than relying on the
// runtime to collect on its own.
//
// Run: node --expose-gc --test test/issue-4068.js

const { test } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { fetch, Request } = require('..')

// Force garbage collection deterministically. Multiple passes give the runtime
// the chance to collect objects that only became unreachable during a previous
// pass (e.g. a controller freed once its owning request was collected).
function forceGc () {
  for (let i = 0; i < 10; i++) {
    global.gc()
  }
}

async function assertClonePropagatesAbortAfterGc (t, makeFollower) {
  // Server that accepts the connection but never responds, so the only way the
  // fetch settles is through abort propagation.
  const server = createServer(() => {})
  t.after(() => server.close())
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}`

  const ac = new AbortController()
  // The source request is intentionally dropped after the follower is created,
  // so only the follower keeps the abort linkage reachable.
  const req = makeFollower(url, ac.signal)

  // Collect now, before the abort. If the follow linkage was weakly held it is
  // gone at this point and the abort below will not reach the fetch.
  forceGc()

  const fetchPromise = fetch(req)

  setTimeout(() => {
    forceGc()
    ac.abort()
  }, 50)

  await t.assert.rejects(fetchPromise, (err) => err.name === 'AbortError')
}

test('cloned request still respects its abort signal after GC', { timeout: 10_000 }, async (t) => {
  if (typeof global.gc !== 'function') {
    t.skip('run with --expose-gc')
    return
  }

  await assertClonePropagatesAbortAfterGc(t, (url, signal) => {
    let req = new Request(url, { signal })
    req = req.clone()
    return req
  })
})

test('constructor-copied request still respects its abort signal after GC', { timeout: 10_000 }, async (t) => {
  if (typeof global.gc !== 'function') {
    t.skip('run with --expose-gc')
    return
  }

  await assertClonePropagatesAbortAfterGc(t, (url, signal) => {
    let req = new Request(url, { signal })
    req = new Request(req)
    return req
  })
})

test('deeply cloned request still respects its abort signal after GC', { timeout: 10_000 }, async (t) => {
  if (typeof global.gc !== 'function') {
    t.skip('run with --expose-gc')
    return
  }

  // A clone of a clone of a copy: every intermediate request is dropped, so the
  // whole ancestor controller chain must be kept reachable by the final clone.
  await assertClonePropagatesAbortAfterGc(t, (url, signal) => {
    let req = new Request(url, { signal })
    req = new Request(req)
    req = req.clone()
    req = req.clone()
    return req
  })
})
