'use strict'

const { LOOPBACK_HOST } = require('../utils/node-http')
const { test } = require('node:test')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { fetch } = require('../..')
const { closeServerAsPromise } = require('../utils/node-http')

test('Undici overrides user-provided `Host` header', async (t) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.headers.host, `${LOOPBACK_HOST}:${server.address().port}`)

    res.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  await fetch(`http://${LOOPBACK_HOST}:${server.address().port}`, {
    headers: {
      host: 'www.idk.org'
    }
  })
})
