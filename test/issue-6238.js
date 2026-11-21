'use strict'

const assert = require('node:assert')
const { once } = require('node:events')
const net = require('node:net')
const { test } = require('node:test')

const { Agent, fetch } = require('..')

// https://github.com/nodejs/undici/issues/6238
test('concurrent requests to a stalled TLS origin time out together', { timeout: 60000 }, async (t) => {
  // Accepts the TCP connection, but never answers the TLS handshake. The
  // protocol is therefore never learned, and the pool keeps every concurrent
  // request queued behind its protocol probe.
  const sockets = []
  const server = net.createServer((socket) => { sockets.push(socket) })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const connectTimeout = 2000
  const dispatcher = new Agent({ connect: { timeout: connectTimeout } })

  t.after(async () => {
    for (const socket of sockets) {
      socket.destroy()
    }
    server.close()
    await dispatcher.destroy()
  })

  const url = `https://127.0.0.1:${server.address().port}/`
  const started = performance.now()

  const elapsed = await Promise.all([1, 2, 3, 4].map(async () => {
    await assert.rejects(fetch(url, { dispatcher }), (error) => error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT')

    return performance.now() - started
  }))

  // Every request has a connect timeout of its own, so they must all reject
  // after about one of them rather than one timeout after another.
  assert.ok(
    Math.max(...elapsed) < 2 * connectTimeout,
    `the requests timed out one after another: ${elapsed.map((ms) => `${(ms / 1000).toFixed(1)}s`).join(', ')}`
  )
})
