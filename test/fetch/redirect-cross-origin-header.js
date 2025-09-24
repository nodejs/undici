'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { fetch } = require('../..')

test('Cross-origin redirects clear forbidden headers', async (t) => {
  t.plan(6)

  const server1 = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.headers.cookie, undefined)
    t.assert.strictEqual(req.headers.authorization, undefined)
    t.assert.strictEqual(req.headers['proxy-authorization'], undefined)

    res.end('redirected')
  }).listen(0)

  const server2 = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.headers.authorization, 'test')
    t.assert.strictEqual(req.headers.cookie, 'ddd=dddd')

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
  t.assert.strictEqual(text, 'redirected')
})
