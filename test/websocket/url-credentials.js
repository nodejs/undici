'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { WebSocket } = require('../..')

test('WebSocket sets Authorization header from URL credentials', async (t) => {
  const server = createServer((req, res) => {
    const expected = 'Basic ' + Buffer.from('foo:bar').toString('base64')
    t.assert.strictEqual(req.headers.authorization, expected)
    res.end()
  }).listen(0)

  await once(server, 'listening')
  t.after(() => server.close())

  const ws = new WebSocket(`ws://foo:bar@localhost:${server.address().port}/`)
  ws.onerror = () => {} // Expected - server doesn't complete WebSocket handshake

  await once(server, 'request')
})

test('WebSocket sets Authorization header with only username', async (t) => {
  const server = createServer((req, res) => {
    const expected = 'Basic ' + Buffer.from('foo:').toString('base64')
    t.assert.strictEqual(req.headers.authorization, expected)
    res.end()
  }).listen(0)

  await once(server, 'listening')
  t.after(() => server.close())

  const ws = new WebSocket(`ws://foo@localhost:${server.address().port}/`)
  ws.onerror = () => {}

  await once(server, 'request')
})

test('WebSocket sets Authorization header with only password', async (t) => {
  const server = createServer((req, res) => {
    const expected = 'Basic ' + Buffer.from(':bar').toString('base64')
    t.assert.strictEqual(req.headers.authorization, expected)
    res.end()
  }).listen(0)

  await once(server, 'listening')
  t.after(() => server.close())

  const ws = new WebSocket(`ws://:bar@localhost:${server.address().port}/`)
  ws.onerror = () => {}

  await once(server, 'request')
})

test('WebSocket does not set Authorization header when no credentials', async (t) => {
  const server = createServer((req, res) => {
    t.assert.strictEqual(req.headers.authorization, undefined)
    res.end()
  }).listen(0)

  await once(server, 'listening')
  t.after(() => server.close())

  const ws = new WebSocket(`ws://localhost:${server.address().port}/`)
  ws.onerror = () => {}

  await once(server, 'request')
})

test('WebSocket custom Authorization header takes precedence over URL credentials', async (t) => {
  const customAuth = 'Bearer mytoken'
  const server = createServer((req, res) => {
    t.assert.strictEqual(req.headers.authorization, customAuth)
    res.end()
  }).listen(0)

  await once(server, 'listening')
  t.after(() => server.close())

  const ws = new WebSocket(`ws://foo:bar@localhost:${server.address().port}/`, {
    headers: {
      Authorization: customAuth
    }
  })
  ws.onerror = () => {}

  await once(server, 'request')
})
