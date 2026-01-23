'use strict'

const { fetch } = require('../..')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { test } = require('node:test')
const assert = require('node:assert')

const { closeServerAsPromise } = require('../utils/node-http')

test('Receiving a 401 status code should not cause infinite retry loop', async (t) => {
  let requestCount = 0

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    requestCount++
    console.log({ requestCount })
    res.statusCode = 401
    res.setHeader('WWW-Authenticate', 'Basic realm="test"')
    res.end('Unauthorized')
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  await assert.rejects(() => fetch(`http://localhost:${server.address().port}`))
})
