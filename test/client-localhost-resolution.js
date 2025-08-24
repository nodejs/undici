'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const http = require('node:http')
const { Client } = require('..')
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

test('core Client resolves subdomains of localhost to loopback', async () => {
  await withServer((req, res) => {
    res.statusCode = 200
    res.setHeader('content-type', 'text/plain')
    res.end('ok')
  }, async ({ port }) => {
    const urls = [
      `http://sub.localhost:${port}`,
      `http://sub.localhost.:${port}`,
      `http://a.b.localhost:${port}`
    ]

    const connected = diagnosticsChannel.channel('undici:client:connected')
    const seen = []
    const allowedHosts = new Set(['sub.localhost', 'sub.localhost.', 'a.b.localhost'])
    const onConnected = (evt) => {
      const { hostname } = evt.connectParams
      if (allowedHosts.has(hostname)) {
        seen.push({ hostname, address: evt.socket.remoteAddress })
      }
    }
    connected.subscribe(onConnected)
    try {
      for (const origin of urls) {
        const client = new Client(origin)
        await new Promise((resolve, reject) => {
          client.request({ path: '/', method: 'GET' }, (err, data) => {
            if (err) return reject(err)
            let body = ''
            data.body.on('data', (chunk) => { body += String(chunk) })
            data.body.on('end', () => {
              try {
                assert.strictEqual(data.statusCode, 200)
                assert.strictEqual(body, 'ok')
                client.close(() => resolve())
              } catch (e) {
                reject(e)
              }
            })
          })
        })
      }

      assert.strictEqual(seen.length, 3)
      for (const { address } of seen) {
        assert.ok(
          address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1',
          `expected loopback, got ${address}`
        )
      }
    } finally {
      connected.unsubscribe(onConnected)
    }
  })
})
