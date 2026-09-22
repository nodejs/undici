'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { caches } = require('../../')
const { closeServerAsPromise } = require('../utils/node-http')

// https://github.com/nodejs/undici/issues/5859
// cache.add()/cache.addAll() consume the response body, so a later
// cache.match()/matchAll() must not tee an already-disturbed stream.
test('cache.match() after cache.add()', async (t) => {
  const server = createServer((_, res) => res.end('hello')).listen(0, '127.0.0.1')
  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const base = `http://127.0.0.1:${server.address().port}`
  const cache = await caches.open('issue-5859-add')
  t.after(() => caches.delete('issue-5859-add'))

  await cache.add(`${base}/hello`)

  const response = await cache.match(`${base}/hello`)
  t.assert.strictEqual(await response.text(), 'hello')
})

test('cache.matchAll() after cache.addAll()', async (t) => {
  const server = createServer((_, res) => res.end('world')).listen(0, '127.0.0.1')
  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const base = `http://127.0.0.1:${server.address().port}`
  const cache = await caches.open('issue-5859-addall')
  t.after(() => caches.delete('issue-5859-addall'))

  await cache.addAll([`${base}/world`])

  const responses = await cache.matchAll()
  t.assert.strictEqual(responses.length, 1)
  t.assert.strictEqual(await responses[0].text(), 'world')
})
