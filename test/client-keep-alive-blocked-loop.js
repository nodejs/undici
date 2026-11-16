'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { once } = require('node:events')
const { stat } = require('node:fs')
const { createServer } = require('node:http')
const { setImmediate: waitImmediate } = require('node:timers/promises')
const { Client } = require('..')

// The keep-alive timer cannot fire while the event loop is blocked. When the
// next request is dispatched from the poll phase, the idle socket validation
// completes in the check phase of the same iteration, before that timer or a
// FIN that arrived during the block is processed. The client must check the
// clock instead, or it reuses a socket that the server may already have
// closed (ECONNRESET).

function sleepSync (ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

async function setup (t, keepAliveTimeout) {
  const state = { connections: 0, disconnects: [] }

  const server = createServer((req, res) => {
    res.end('ok')
  })
  // No Keep-Alive hint from the server, so the client's keepAliveTimeout
  // alone sets the idle timeout. The server never closes the connection
  // itself, so the test only passes if the client opens a new one.
  server.keepAliveTimeout = 0
  server.on('connection', () => {
    state.connections++
  })
  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`, {
    keepAliveTimeout
  })
  client.on('disconnect', (origin, targets, err) => {
    state.disconnects.push(err)
  })

  t.after(async () => {
    await client.close()
    server.close()
  })

  const res = await client.request({ path: '/', method: 'GET' })
  assert.strictEqual(await res.body.text(), 'ok')
  // Let the socket settle into the idle state.
  await waitImmediate()
  assert.strictEqual(state.connections, 1)

  return { client, state }
}

// Blocks for `blockMs`, then dispatches a request, from an fs callback, i.e.
// from the poll phase.
function requestAfterBlockInPollPhase (client, blockMs) {
  return new Promise((resolve, reject) => {
    stat(__filename, () => {
      sleepSync(blockMs)
      client.request({ path: '/', method: 'GET' }).then(resolve, reject)
    })
  })
}

test('does not reuse an idle socket whose keep-alive timeout passed while the event loop was blocked', async (t) => {
  const { client, state } = await setup(t, 200)

  const res = await requestAfterBlockInPollPhase(client, 600)
  assert.strictEqual(await res.body.text(), 'ok')

  assert.strictEqual(state.connections, 2)
  assert.strictEqual(state.disconnects.length, 1)
  assert.strictEqual(state.disconnects[0].code, 'UND_ERR_INFO')
  assert.strictEqual(state.disconnects[0].message, 'socket idle timeout')
})

test('reuses an idle socket whose keep-alive timeout did not pass while the event loop was blocked', async (t) => {
  const { client, state } = await setup(t, 60e3)

  const res = await requestAfterBlockInPollPhase(client, 600)
  assert.strictEqual(await res.body.text(), 'ok')

  assert.strictEqual(state.connections, 1)
  assert.strictEqual(state.disconnects.length, 0)
})
