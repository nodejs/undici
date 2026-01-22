'use strict'

const { fetch } = require('../..')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { test } = require('node:test')

const { closeServerAsPromise } = require('../utils/node-http')

test('Receiving a 401 status code should not cause infinite retry loop', async (t) => {
  let requestCount = 0

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    requestCount++
    res.statusCode = 401
    res.setHeader('WWW-Authenticate', 'Basic realm="test"')
    res.end('Unauthorized')
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const response = await fetch(`http://localhost:${server.address().port}`)

  t.assert.strictEqual(response.status, 401)
  t.assert.strictEqual(requestCount, 1, 'should only make one request, not retry infinitely')
})

test('Receiving a 401 status code with credentials include should not cause infinite retry loop', async (t) => {
  let requestCount = 0

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    requestCount++
    res.statusCode = 401
    res.setHeader('WWW-Authenticate', 'Basic realm="test"')
    res.end('Unauthorized')
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const response = await fetch(`http://localhost:${server.address().port}`, {
    credentials: 'include'
  })

  t.assert.strictEqual(response.status, 401)
  t.assert.strictEqual(requestCount, 1, 'should only make one request, not retry infinitely')
})
