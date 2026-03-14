'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { fetch } = require('../..')
const { closeServerAsPromise } = require('../utils/node-http')

// https://github.com/nodejs/undici/issues/4836
test('fetch preserves trailing ? in request URL', async (t) => {
  const server = createServer((req, res) => {
    res.end(req.url)
  }).listen(0)

  await once(server, 'listening')
  t.after(closeServerAsPromise(server))

  const base = `http://localhost:${server.address().port}`

  const cases = [
    ['/echo', '/echo'],
    ['/echo?', '/echo?'],
    ['/echo?a=b', '/echo?a=b'],
    ['/echo?a=b&c=d', '/echo?a=b&c=d'],
    ['/echo?#frag', '/echo?'],
    ['/echo#?', '/echo'],
    ['/echo#frag?bar', '/echo']
  ]

  for (const [path, expected] of cases) {
    await t.test(`path: ${path} → ${expected}`, async (t) => {
      const res = await fetch(`${base}${path}`)
      const body = await res.text()
      t.assert.strictEqual(body, expected)
    })
  }
})
