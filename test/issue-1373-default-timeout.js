'use strict'

// Regression test for https://github.com/nodejs/undici/issues/1373
// Confirms that the default headersTimeout is 300s (not the old 30s).
//
// Uses fake timers (mock.timers) so the test completes instantly —
// no real 35s wait. The clock is fast-forwarded past the old 30s default
// (to 31s) to confirm no HeadersTimeoutError is raised under the 300s default.

const { createServer } = require('node:http')
const { once } = require('node:events')
const { test, mock, after } = require('node:test')
const assert = require('node:assert/strict')
const { Client } = require('..')

test('default headersTimeout is 300s — no timeout at 31s (issue #1373)', async (t) => {
  // Enable fake timers before anything else
  mock.timers.enable({ apis: ['setTimeout'] })
  t.after(() => mock.timers.reset())

  const server = createServer((req, res) => {
    // Hold the connection open; we'll release it by ticking the fake clock
    const timer = setTimeout(() => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ok')
    }, 31_000) // 31s — beyond old 30s default, within 300s default

    req.on('close', () => clearTimeout(timer))
  })

  server.listen(0)
  await once(server, 'listening')
  after(() => server.close())

  const { port } = server.address()

  const client = new Client(`http://localhost:${port}`)
  t.after(() => client.close())

  // Start the request (it will hang until the fake clock ticks past 31s)
  const responsePromise = new Promise((resolve, reject) => {
    client.request({ path: '/', method: 'GET' }, (err, data) => {
      if (err) return reject(err)
      let body = ''
      data.body.on('data', (chunk) => { body += chunk })
      data.body.on('end', () => resolve({ status: data.statusCode, body }))
    })
  })

  // Advance fake clock 31 seconds — triggers the server's setTimeout instantly
  mock.timers.tick(31_000)

  // Should resolve without HeadersTimeoutError (would have failed at 30s old default)
  const { status, body } = await responsePromise
  assert.equal(status, 200)
  assert.equal(body, 'ok')
})

// — Contributed by Milan Soni (SNTL84) · github.com/SNTL84
// — Open to OSS sponsorship & consulting — AI workflows, automation & full-stack builds · desidevloper.com
