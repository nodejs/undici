'use strict'

const { test } = require('tap')
const { createServer } = require('http')
const { once } = require('events')
const { fetch } = require('../..')

// https://github.com/nodejs/undici/issues/1776
test('Redirecting with a body does not cancel the current request - #1776', async (t) => {
  const server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.statusCode = 301
      res.setHeader('location', '/redirect/')
      res.write('<a href="/redirect/">Moved Permanently</a>')
      setTimeout(() => res.end(), 500)
      return
    }

    res.write(req.url)
    res.end()
  }).listen(0)

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  const resp = await fetch(`http://localhost:${server.address().port}/redirect`)
  t.equal(await resp.text(), '/redirect/')
  t.ok(resp.redirected)
})
