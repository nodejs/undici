'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { fetch, Agent } = require('../..')

test('fetch follow does not pin the keep-alive socket on a 301 with a large body', { timeout: 15_000 }, async (t) => {
  const dispatcher = new Agent({ connections: 1, keepAliveTimeout: 10_000 })
  const redirectBody = Buffer.alloc(128 * 1024, 0x78)

  const server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(301, { Location: '/final' })
      res.end(redirectBody)
      return
    }
    res.end('ok')
  }).listen(0)

  t.after(async () => {
    await dispatcher.destroy()
    server.close()
  })

  await once(server, 'listening')

  const url = `http://127.0.0.1:${server.address().port}/redirect`
  const first = await fetch(url, { dispatcher, redirect: 'follow' })

  t.assert.strictEqual(first.status, 200)
  t.assert.strictEqual(await first.text(), 'ok')
  t.assert.ok(first.redirected)
})
