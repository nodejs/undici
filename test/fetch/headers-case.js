'use strict'

const { fetch, Headers, Request } = require('../..')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { test } = require('node:test')
const { closeServerAsPromise } = require('../utils/node-http')

test('Headers retain keys case-sensitive', async (t) => {
  t.plan(4)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.ok(req.rawHeaders.includes('Content-Type'))

    res.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const url = `http://localhost:${server.address().port}`
  for (const headers of [
    new Headers([['Content-Type', 'text/plain']]),
    { 'Content-Type': 'text/plain' },
    [['Content-Type', 'text/plain']]
  ]) {
    await fetch(url, { headers })
  }
  // see https://github.com/nodejs/undici/pull/3183
  await fetch(new Request(url, { headers: [['Content-Type', 'text/plain']] }), { method: 'GET' })
})
