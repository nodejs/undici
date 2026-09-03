'use strict'

/**
 * Regression for https://github.com/nodejs/undici/issues/5615
 * Cache.add / Cache.addAll hung forever when the response had a body
 * because processResponseEndOfBody only ran after the pull-driven body
 * stream finished, and nothing pulled it.
 */

const { test } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { caches } = require('../..')

test('cache.add settles for a 200 response with a body', async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello')
  })
  t.after(() => server.close())
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const base = `http://127.0.0.1:${server.address().port}`
  const cache = await caches.open('cache-add-body')
  t.after(async () => {
    await caches.delete('cache-add-body')
  })

  await Promise.race([
    cache.add(`${base}/`),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('cache.add hung for body-bearing response')), 3000)
    )
  ])

  const keys = await cache.keys()
  t.assert.strictEqual(keys.length, 1)
  t.assert.strictEqual(keys[0].url, `${base}/`)

  const match = await cache.match(`${base}/`)
  t.assert.ok(match)
  t.assert.strictEqual(await match.text(), 'hello')
})

test('cache.add settles for a 204 response (no body)', async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(204)
    res.end()
  })
  t.after(() => server.close())
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const base = `http://127.0.0.1:${server.address().port}`
  const cache = await caches.open('cache-add-empty')
  t.after(async () => {
    await caches.delete('cache-add-empty')
  })

  await Promise.race([
    cache.add(`${base}/`),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('cache.add hung for empty response')), 3000)
    )
  ])
})
