'use strict'

// Regression tests for https://github.com/nodejs/undici/issues/1305 (part 3):
// the Fetch Metadata append step must not clobber a user-provided
// `Sec-Fetch-Mode` header. The spec was written for the browser setting
// where this header is a forbidden-request-header; undici runs in Node and
// users have legitimate reasons to override it for server-side use cases.

const { test } = require('node:test')
const events = require('node:events')
const http = require('node:http')

const { fetch, Headers } = require('../../')
const { closeServerAsPromise } = require('../utils/node-http')

async function startEchoServer (t) {
  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('x-received-sec-fetch-mode', req.headers['sec-fetch-mode'] ?? '')
    res.end()
  })
  t.after(closeServerAsPromise(server))
  server.listen(0)
  await events.once(server, 'listening')
  return `http://127.0.0.1:${server.address().port}`
}

test('defaults sec-fetch-mode to cors when the user did not provide one', async (t) => {
  const url = await startEchoServer(t)
  const res = await fetch(url)
  t.assert.strictEqual(res.headers.get('x-received-sec-fetch-mode'), 'cors')
})

test('honors a user-provided sec-fetch-mode via init.headers object', async (t) => {
  const url = await startEchoServer(t)
  const res = await fetch(url, { headers: { 'sec-fetch-mode': 'navigate' } })
  t.assert.strictEqual(res.headers.get('x-received-sec-fetch-mode'), 'navigate')
})

test('honors a user-provided sec-fetch-mode via a Headers instance', async (t) => {
  const url = await startEchoServer(t)
  const headers = new Headers()
  headers.set('sec-fetch-mode', 'no-cors')
  const res = await fetch(url, { headers })
  t.assert.strictEqual(res.headers.get('x-received-sec-fetch-mode'), 'no-cors')
})

test('honors a user-provided sec-fetch-mode via init.headers tuple array', async (t) => {
  const url = await startEchoServer(t)
  const res = await fetch(url, { headers: [['sec-fetch-mode', 'same-origin']] })
  t.assert.strictEqual(res.headers.get('x-received-sec-fetch-mode'), 'same-origin')
})

test('honors an empty string sec-fetch-mode (users opt out of the default value)', async (t) => {
  const url = await startEchoServer(t)
  const res = await fetch(url, { headers: { 'sec-fetch-mode': '' } })
  t.assert.strictEqual(res.headers.get('x-received-sec-fetch-mode'), '')
})

test('is case-insensitive for the user-provided header name', async (t) => {
  const url = await startEchoServer(t)
  const res = await fetch(url, { headers: { 'Sec-Fetch-Mode': 'websocket' } })
  t.assert.strictEqual(res.headers.get('x-received-sec-fetch-mode'), 'websocket')
})

test('user-provided sec-fetch-mode survives a redirect to the same origin', async (t) => {
  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    if (req.url === '/start') {
      res.writeHead(302, { location: '/end' })
      res.end()
      return
    }
    res.setHeader('x-received-sec-fetch-mode', req.headers['sec-fetch-mode'] ?? '')
    res.end()
  })
  t.after(closeServerAsPromise(server))
  server.listen(0)
  await events.once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  const res = await fetch(`${base}/start`, { headers: { 'sec-fetch-mode': 'navigate' } })
  t.assert.strictEqual(res.headers.get('x-received-sec-fetch-mode'), 'navigate')
})
