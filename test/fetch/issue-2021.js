'use strict'

const { test } = require('tap')
const { once } = require('events')
const { createServer } = require('http')
const { fetch } = require('../..')

// https://github.com/nodejs/undici/issues/2021
test('content-length header is removed on redirect', async (t) => {
  const server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/redirect2' })
      res.end()
      return
    }

    res.end()
  }).listen(0).unref()

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  const body = 'a+b+c'

  await t.resolves(fetch(`http://localhost:${server.address().port}/redirect`, {
    method: 'POST',
    body,
    headers: {
      'content-length': Buffer.byteLength(body)
    }
  }))
})
