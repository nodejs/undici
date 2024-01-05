'use strict'

const { test } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const { once } = require('events')
const { createServer } = require('http')
const { fetch } = require('../..')

test('Undici overrides user-provided `Host` header', async (t) => {
  const { strictEqual } = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    strictEqual(req.headers.host, `localhost:${server.address().port}`)

    res.end()
  }).listen(0)

  t.after(server.close.bind(server))
  await once(server, 'listening')

  await fetch(`http://localhost:${server.address().port}`, {
    headers: {
      host: 'www.idk.org'
    }
  })
})
