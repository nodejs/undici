'use strict'

const { LOOPBACK_HOST } = require('../utils/node-http')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')
const { fetch } = require('../..')

// https://github.com/nodejs/undici/issues/3767
test('referrerPolicy unsafe-url is respected', async (t) => {
  t.plan(1)

  const referrer = 'https://google.com/hello/world'

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.deepEqual(req.headers.referer, referrer)

    res.end()
  }).listen(0)

  t.after(server.close.bind(server))
  await once(server, 'listening')

  await fetch(`http://${LOOPBACK_HOST}:${server.address().port}`, {
    referrer,
    referrerPolicy: 'unsafe-url'
  })
})
