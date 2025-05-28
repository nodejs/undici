'use strict'

const { test } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { fetch } = require('../..')

test('a non-empty origin is not appended (issue #3334)', async (t) => {
  const { strictEqual } = tspl(t, { plan: 1 })
  const origin = 'https://origin.example.com'

  const server = createServer((req, res) => {
    strictEqual(req.headers.origin, origin)
    res.end()
  }).listen(0)

  t.after(server.close.bind(server))
  await once(server, 'listening')

  await fetch(`http://localhost:${server.address().port}`, {
    headers: { origin },
    body: '',
    method: 'POST',
    redirect: 'error'
  })
})
