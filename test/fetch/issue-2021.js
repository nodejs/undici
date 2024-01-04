'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
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

  t.after(server.close.bind(server))
  await once(server, 'listening')

  const body = 'a+b+c'

  await assert.doesNotReject(fetch(`http://localhost:${server.address().port}/redirect`, {
    method: 'POST',
    body,
    headers: {
      'content-length': Buffer.byteLength(body)
    }
  }))
})
