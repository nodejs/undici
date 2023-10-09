'use strict'

const { test } = require('tap')
const { once } = require('events')
const { createServer } = require('http')
const { fetch } = require('../..')

test('Undici overrides user-provided `Host` header', async (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    t.equal(req.headers.host, `localhost:${server.address().port}`)

    res.end()
  }).listen(0)

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  await fetch(`http://localhost:${server.address().port}`, {
    headers: {
      host: 'www.idk.org'
    }
  })
})
