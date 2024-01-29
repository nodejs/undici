'use strict'

const { fetch } = require('../..')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { test } = require('node:test')
const assert = require('node:assert')

const { closeServerAsPromise } = require('../utils/node-http')

test('Receiving a 407 status code w/ a window option present should reject', async (t) => {
  const server = createServer((req, res) => {
    res.statusCode = 407
    res.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  // if init.window exists, the spec tells us to set request.window to 'no-window',
  // which later causes the request to be rejected if the status code is 407
  await assert.rejects(fetch(`http://localhost:${server.address().port}`, { window: null }))
})
