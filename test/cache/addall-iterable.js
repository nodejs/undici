'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { caches, Request } = require('../../')
const { closeServerAsPromise } = require('../utils/node-http')

test('cache.addAll consumes a request iterable once', async (t) => {
  let hits = 0
  const server = createServer((req, res) => {
    hits++
    res.writeHead(204).end()
  }).listen(0, '127.0.0.1')
  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const base = `http://127.0.0.1:${server.address().port}`
  const cache = await caches.open('addall-iterable')
  t.after(() => caches.delete('addall-iterable'))

  function * requests () {
    yield `${base}/first`
    yield new Request(`${base}/second`)
  }

  await cache.addAll(requests())

  t.assert.strictEqual(hits, 2)
  t.assert.deepStrictEqual((await cache.keys()).map(request => request.url), [
    `${base}/first`, `${base}/second`
  ])

  const failure = new Error('iteration failed')
  function * failingRequests () {
    yield `${base}/third`
    throw failure
  }

  await t.assert.rejects(cache.addAll(failingRequests()), failure)
  t.assert.strictEqual(hits, 2)
})
