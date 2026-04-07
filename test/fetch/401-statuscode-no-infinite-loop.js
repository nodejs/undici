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

test('Receiving a 401 status code should not fail for stream-backed request bodies', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.statusCode = 401
    res.end('Unauthorized')
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const response = await fetch(`http://localhost:${server.address().port}`, {
    method: 'PUT',
    duplex: 'half',
    body: new ReadableStream({
      start (controller) {
        controller.enqueue(Buffer.from('hello world'))
        controller.close()
      }
    })
  })

  assert.strictEqual(response.status, 401)
})

test('Receiving a 401 status code should work for POST with JSON body', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.statusCode = 401
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'unauthorized' }))
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const response = await fetch(`http://localhost:${server.address().port}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: 'test' })
  })

  assert.strictEqual(response.status, 401)
  const body = await response.json()
  assert.deepStrictEqual(body, { error: 'unauthorized' })
})
