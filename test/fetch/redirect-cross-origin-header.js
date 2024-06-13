'use strict'

const { test } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { fetch } = require('../..')

test('Cross-origin redirects clear forbidden headers', async (t) => {
  const { strictEqual } = tspl(t, { plan: 6 })

  const server1 = createServer((req, res) => {
    strictEqual(req.headers.cookie, undefined)
    strictEqual(req.headers.authorization, undefined)
    strictEqual(req.headers['proxy-authorization'], undefined)

    res.end('redirected')
  }).listen(0)

  const server2 = createServer((req, res) => {
    strictEqual(req.headers.authorization, 'test')
    strictEqual(req.headers.cookie, 'ddd=dddd')

    res.writeHead(302, {
      ...req.headers,
      Location: `http://localhost:${server1.address().port}`
    })
    res.end()
  }).listen(0)

  t.after(() => {
    server1.close()
    server2.close()
  })

  await Promise.all([
    once(server1, 'listening'),
    once(server2, 'listening')
  ])

  const res = await fetch(`http://localhost:${server2.address().port}`, {
    headers: {
      Authorization: 'test',
      Cookie: 'ddd=dddd',
      'Proxy-Authorization': 'test'
    }
  })

  const text = await res.text()
  strictEqual(text, 'redirected')
})
