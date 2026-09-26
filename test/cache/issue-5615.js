'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { caches } = require('../../')
const { closeServerAsPromise } = require('../utils/node-http')

// https://github.com/nodejs/undici/issues/5615
test('cache.add and cache.addAll settle for responses with a body', async (t) => {
  const server = createServer((req, res) => {
    if (req.url === '/empty') { res.writeHead(204); return res.end() }
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello')
  }).listen(0, '127.0.0.1')

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const base = `http://127.0.0.1:${server.address().port}`
  const cache = await caches.open('issue-5615')

  t.after(async () => {
    await caches.delete('issue-5615')
  })

  await cache.add(`${base}/body`)
  await cache.addAll([`${base}/body`])
  await cache.add(`${base}/empty`)

  t.assert.deepStrictEqual((await cache.keys()).map(r => r.url), [`${base}/body`, `${base}/empty`])
})

// https://github.com/nodejs/undici/issues/5859
test('cache.match and cache.matchAll work after cache.add and cache.addAll', async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello')
  }).listen(0, '127.0.0.1')

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const base = `http://127.0.0.1:${server.address().port}`
  const cache = await caches.open('issue-5859')

  t.after(async () => {
    await caches.delete('issue-5859')
  })

  await cache.add(`${base}/add`)
  await cache.addAll([`${base}/addAll`])

  const response = await cache.match(`${base}/add`)
  t.assert.strictEqual(await response.text(), 'hello')

  // Matching again must still work
  const again = await cache.match(`${base}/add`)
  t.assert.strictEqual(await again.text(), 'hello')

  const responses = await cache.matchAll()
  t.assert.strictEqual(responses.length, 2)
  for (const r of responses) {
    t.assert.strictEqual(await r.text(), 'hello')
  }
})
