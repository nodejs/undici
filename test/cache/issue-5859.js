'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { caches } = require('../..')

async function startServer (t) {
  const server = createServer((_, res) => res.end('hello')).listen(0)
  t.after(() => server.close())
  await once(server, 'listening')
  return `http://localhost:${server.address().port}`
}

test('cache.match() after cache.add()', async (t) => {
  const base = await startServer(t)
  const cache = await caches.open('hello')

  await cache.add(`${base}/hello`)

  const response = await cache.match(`${base}/hello`)
  t.assert.strictEqual(await response.text(), 'hello')
})

test('cache.matchAll() after cache.addAll()', async (t) => {
  const base = await startServer(t)
  const cache = await caches.open('world')

  await cache.addAll([`${base}/world`])

  const responses = await cache.matchAll()
  t.assert.strictEqual(responses.length, 1)
})
