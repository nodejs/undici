'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { fetch, Agent } = require('../..')

test('fetch does not pin a pooled connection on a redirect with an unread body', async (t) => {
  // Large enough that the 3xx body does not fit in the stream's buffer, so an
  // undrained body leaves the socket unusable for the follow-up request.
  const redirectBody = Buffer.alloc(128 * 1024, 0x78)

  const server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(301, { Location: '/final' })
      res.end(redirectBody)
      return
    }
    res.end('ok')
  })

  // A single connection, so a pinned socket cannot be worked around.
  const dispatcher = new Agent({ connections: 1, keepAliveTimeout: 10_000 })

  t.after(async () => {
    await dispatcher.destroy()
    server.close()
  })

  server.listen(0)
  await once(server, 'listening')

  const url = `http://127.0.0.1:${server.address().port}/redirect`
  const response = await fetch(url, { dispatcher, redirect: 'follow' })

  assert.strictEqual(response.status, 200)
  assert.strictEqual(await response.text(), 'ok')
  assert.ok(response.redirected)
})
