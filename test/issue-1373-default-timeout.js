'use strict'

// Regression test for https://github.com/nodejs/undici/issues/1373
// Confirms that the default headersTimeout is 300s (not the old 30s),
// so a server that responds after 35s does NOT trigger HeadersTimeoutError.

const { createServer } = require('node:http')
const { once } = require('node:events')
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { fetch } = require('..')

test('default headersTimeout is 300s — no timeout for 35s slow server (issue #1373)', async (t) => {
  const server = createServer((req, res) => {
    // Respond after 35 seconds — exceeds old 30s default, within new 300s default
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ok')
    }, 35_000)
  })

  server.listen(0)
  await once(server, 'listening')
  after(() => server.close())

  const { port } = server.address()

  // This MUST NOT throw HeadersTimeoutError with the 300s default.
  // It would have thrown under the old 30s default.
  const res = await fetch(`http://localhost:${port}/`)
  assert.equal(res.status, 200)
  assert.equal(await res.text(), 'ok')
})
