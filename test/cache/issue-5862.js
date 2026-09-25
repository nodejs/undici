'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { caches, fetch, Request, Response } = require('../..')

test('fetch() with a request from cache.keys() whose referrer is a URL', async (t) => {
  const server = createServer((req, res) => res.end(req.headers.referer)).listen(0)
  t.after(() => server.close())
  await once(server, 'listening')

  const base = `http://localhost:${server.address().port}`
  const cache = await caches.open('issue-5862')

  await cache.put(new Request(`${base}/`, { referrer: `${base}/ref` }), new Response('x'))
  const [k] = await cache.keys()

  const response = await fetch(k)
  t.assert.strictEqual(await response.text(), `${base}/ref`)
})
