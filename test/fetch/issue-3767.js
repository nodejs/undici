'use strict'

const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')
const { fetch } = require('../..')
const { tspl } = require('@matteo.collina/tspl')

// https://github.com/nodejs/undici/issues/3767
test('referrerPolicy unsafe-url is respected', async (t) => {
  const { completed, deepEqual } = tspl(t, { plan: 1 })

  const referrer = 'https://google.com/hello/world'

  const server = createServer((req, res) => {
    deepEqual(req.headers.referer, referrer)

    res.end()
  }).listen(0)

  t.after(server.close.bind(server))
  await once(server, 'listening')

  await fetch(`http://localhost:${server.address().port}`, {
    referrer,
    referrerPolicy: 'unsafe-url'
  })

  await completed
})
