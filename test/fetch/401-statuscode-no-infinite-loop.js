'use strict'

const { fetch } = require('../..')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { test } = require('node:test')
const assert = require('node:assert')

const { closeServerAsPromise } = require('../utils/node-http')

test('Receiving a 401 status code should not cause infinite retry loop', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.statusCode = 401
    res.end('Unauthorized')
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const response = await fetch(`http://localhost:${server.address().port}`)
  assert.strictEqual(response.status, 401)
})
