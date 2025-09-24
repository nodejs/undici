'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { fetch } = require('../..')

test('a non-empty origin is not appended (issue #3334)', async (t) => {
  t.plan(1)
  const origin = 'https://origin.example.com'

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.headers.origin, origin)
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
