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
