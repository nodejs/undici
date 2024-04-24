'use strict'

const { fetch, Headers } = require('../..')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { test } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')

test('Headers retain keys case-sensitive', async (t) => {
  const assert = tspl(t, { plan: 3 })

  const server = createServer((req, res) => {
    console.log(req.rawHeaders)
    assert.ok(req.rawHeaders.includes('Content-Type'))

    res.end()
  }).listen(0)

  t.after(() => server.close())
  await once(server, 'listening')

  for (const headers of [
    new Headers([['Content-Type', 'text/plain']]),
    { 'Content-Type': 'text/plain' },
    [['Content-Type', 'text/plain']]
  ]) {
    await fetch(`http://localhost:${server.address().port}`, {
      headers
    })
  }
})
