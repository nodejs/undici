'use strict'

const { test } = require('tap')
const { createServer } = require('http')
const { once } = require('events')
const { fetch } = require('../..')

test('Cross-origin redirects clear forbidden headers', async (t) => {
  t.plan(6)

  const server1 = createServer((req, res) => {
    t.equal(req.headers.cookie, undefined)
    t.equal(req.headers.authorization, undefined)
    t.equal(req.headers['proxy-authorization'], undefined)

    res.end('redirected')
  }).listen(0)

  const server2 = createServer((req, res) => {
    t.equal(req.headers.authorization, 'test')
    t.equal(req.headers.cookie, 'ddd=dddd')

    res.writeHead(302, {
      ...req.headers,
      Location: `http://localhost:${server1.address().port}`
    })
    res.end()
  }).listen(0)

  t.teardown(() => {
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
  t.equal(text, 'redirected')
})
