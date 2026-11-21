'use strict'

const assert = require('node:assert')
const { once } = require('node:events')
const { createServer } = require('node:http2')
const { test } = require('node:test')
const { setTimeout: sleep } = require('node:timers/promises')

const { Client, fetch } = require('..')

test('Issue #6143 - aborted fetch on an established h2 session does not cause an uncaught idle timeout', { timeout: 5000 }, async (t) => {
  const server = createServer()
  server.on('session', (session) => session.on('error', () => {}))
  server.on('stream', (stream) => {
    stream.on('error', () => {})
    stream.respond({ ':status': 200 })
    stream.end('ok')
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const url = `http://127.0.0.1:${server.address().port}`
  const client = new Client(url, {
    useH2c: true,
    keepAliveTimeout: 100
  })

  t.after(async () => {
    await client.destroy()
    await new Promise((resolve) => server.close(resolve))
  })

  await (await fetch(url, { dispatcher: client })).text()

  const controller = new AbortController()
  const request = fetch(url, {
    dispatcher: client,
    signal: controller.signal
  })
  controller.abort()

  await assert.rejects(request, { name: 'AbortError' })

  // Let the idle timer fire and tear the session down.
  await sleep(300)
})
