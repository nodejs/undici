'use strict'

const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')
const { fetch } = require('../..')
const { tspl } = require('@matteo.collina/tspl')

// https://github.com/DIYgod/RSSHub/issues/15532
test('An invalid Origin header is not set', async (t) => {
  const { deepStrictEqual } = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    deepStrictEqual(req.headers.origin, undefined)

    res.end()
  }).listen(0)

  await once(server, 'listening')
  t.after(server.close.bind(server))

  await fetch(`http://localhost:${server.address().port}`, {
    method: 'POST'
  })
})
