'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { fetch } = require('../..')
const { closeServerAsPromise } = require('../utils/node-http')

// https://github.com/nodejs/undici/issues/1776
test('Redirecting with a body does not cancel the current request - #1776', async (t) => {
  const server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.statusCode = 301
      res.setHeader('location', '/redirect/')
      res.write('<a href="/redirect/">Moved Permanently</a>')
      setTimeout(() => res.end(), 500)
      return
    }

    res.write(req.url)
    res.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const resp = await fetch(`http://localhost:${server.address().port}/redirect`)
  assert.strictEqual(await resp.text(), '/redirect/')
  assert.ok(resp.redirected)
})

test('Redirecting with an empty body does not throw an error - #2027', async (t) => {
  const server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.statusCode = 307
      res.setHeader('location', '/redirect/')
      res.write('<a href="/redirect/">Moved Permanently</a>')
      res.end()
      return
    }
    res.write(req.url)
    res.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const resp = await fetch(`http://localhost:${server.address().port}/redirect`, { method: 'PUT', body: '' })
  assert.strictEqual(await resp.text(), '/redirect/')
  assert.ok(resp.redirected)
})

test('Redirecting with a body does not fail to write body - #2543', async (t) => {
  const server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(307, { location: '/target' })
      res.write('<a href="/redirect/">Moved Permanently</a>')
      setTimeout(() => res.end(), 500)
    } else {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => assert.strictEqual(body, 'body'))
      res.write('ok')
      res.end()
    }
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const resp = await fetch(`http://localhost:${server.address().port}/redirect`, {
    method: 'POST',
    body: 'body'
  })
  assert.strictEqual(await resp.text(), 'ok')
  assert.ok(resp.redirected)
})
