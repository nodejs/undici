'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const http = require('node:http')
const { fetch } = require('../..')
const diagnosticsChannel = require('node:diagnostics_channel')

async function withServer (handler, fn) {
  const server = http.createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const { port } = server.address()
    return await fn({ port })
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('fetch resolves subdomains of localhost to loopback', async (t) => {
  const connected = diagnosticsChannel.channel('undici:client:connected')
  const seen = []
  const onConnected = (evt) => {
    seen.push({ hostname: evt.connectParams.hostname, address: evt.socket.remoteAddress })
  }
  connected.subscribe(onConnected)
  try {
    await withServer((req, res) => {
      res.statusCode = 200
      res.setHeader('content-type', 'text/plain')
      res.end('ok')
    }, async ({ port }) => {
      const urls = [
        `http://sub.localhost:${port}/`,
        `http://sub.localhost.:${port}/`,
        `http://a.b.localhost:${port}/`
      ]

      for (const url of urls) {
        const resp = await fetch(url)
        assert.strictEqual(resp.ok, true)
        assert.strictEqual(resp.status, 200)
        assert.strictEqual(await resp.text(), 'ok')
      }

      assert.strictEqual(seen.length, 3)
      for (const { address } of seen) {
        assert.ok(
          address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1',
          `expected loopback, got ${address}`
        )
      }
    })
  } finally {
    connected.unsubscribe(onConnected)
  }
})
