'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { fetch } = require('../..')
const { closeServerAsPromise } = require('../utils/node-http')

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

  t.after(closeServerAsPromise(server))
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
