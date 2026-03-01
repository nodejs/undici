'use strict'

// Regression test for:
// TypeError: Cannot read properties of null (reading 'servername')
//   at _resume (lib/dispatcher/client.js)
//
// Race condition in H2: when a stream's 'end' event fires, client-h2.js does:
//   client[kQueue][client[kRunningIdx]++] = null   <- nulls the slot
//   client[kResume]()                              <- _resume reads null slot
//
// If kPendingIdx was reset to kRunningIdx (e.g. by onHttp2SocketClose) between
// writeH2 dispatching the stream and the 'end' event firing, kPendingIdx now
// points at the null slot. _resume fetches kQueue[kPendingIdx] = null and
// crashes on null.servername.
//
// Fix: null guard in _resume after fetching the request from the queue.

const { test } = require('node:test')
const assert = require('node:assert')
const { Client } = require('..')
const {
  kQueue,
  kRunningIdx,
  kPendingIdx,
  kResume
} = require('../lib/core/symbols')

test('_resume should not crash when kQueue[kPendingIdx] is null', (t) => {
  // Create a client against a non-existent server — we never connect,
  // we only need the properly-initialized internal state.
  const client = new Client('https://localhost:1', {
    connect: { rejectUnauthorized: false },
    allowH2: true
  })

  // Reproduce the exact queue state that triggers the bug:
  //
  //   kQueue = [null]   (slot was nulled by: kQueue[kRunningIdx++] = null)
  //   kRunningIdx = 0   (points at the null slot)
  //   kPendingIdx = 0   (reset to kRunningIdx by onHttp2SocketClose)
  //
  // kPending = kQueue.length - kPendingIdx = 1 - 0 = 1  (non-zero, passes the guard)
  // kRunning = kPendingIdx - kRunningIdx   = 0 - 0 = 0  (below pipelining limit)
  // kQueue[kPendingIdx] = null                           (the crash point)
  client[kQueue].push(null)
  client[kRunningIdx] = 0
  client[kPendingIdx] = 0

  // Calling kResume() now replicates what client-h2.js does after nulling the slot.
  // Without the fix: TypeError: Cannot read properties of null (reading 'servername')
  // With the fix:    returns early safely.
  assert.doesNotThrow(
    () => client[kResume](),
    'Expected _resume to handle null queue slot without throwing'
  )

  // Restore a valid queue state before destroying so the client
  // doesn't trip over the null slot we injected during cleanup.
  client[kQueue].length = 0
  client[kRunningIdx] = 0
  client[kPendingIdx] = 0

  client.destroy().catch(() => {})
})