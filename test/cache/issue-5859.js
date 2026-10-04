'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { caches } = require('../../')
const { closeServerAsPromise } = require('../utils/node-http')

// https://github.com/nodejs/undici/issues/5859
test('cache.match and cache.matchAll succeed after cache.add and cache.addAll', async (t) => {
  const server = createServer((req, res) => {
    if (req.url === '/empty') {
      res.writeHead(204)
      res.end()
      return
    }
    if (req.url === '/json') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ hello: 'world' }))
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('sample text content')
  }).listen(0, '127.0.0.1')

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const base = `http://127.0.0.1:${server.address().port}`
  const cacheName = 'issue-5859'
  const cache = await caches.open(cacheName)

  t.after(async () => {
    await caches.delete(cacheName)
  })

  await cache.add(`${base}/text`)

  const textMatchFirst = await cache.match(`${base}/text`)
  t.assert.ok(textMatchFirst)
  t.assert.strictEqual(await textMatchFirst.text(), 'sample text content')

  const textMatchSecond = await cache.match(`${base}/text`)
  t.assert.ok(textMatchSecond)
  t.assert.strictEqual(await textMatchSecond.text(), 'sample text content')

  await cache.addAll([`${base}/json`, `${base}/empty`])

  const jsonMatch = await cache.match(`${base}/json`)
  t.assert.ok(jsonMatch)
  t.assert.deepStrictEqual(await jsonMatch.json(), { hello: 'world' })

  const emptyMatch = await cache.match(`${base}/empty`)
  t.assert.ok(emptyMatch)
  t.assert.strictEqual(emptyMatch.status, 204)
  t.assert.strictEqual(await emptyMatch.text(), '')

  const allMatches = await cache.matchAll()
  t.assert.strictEqual(allMatches.length, 3)

  const matchTexts = await Promise.all(allMatches.map((res) => res.text()))
  t.assert.ok(matchTexts.includes('sample text content'))
  t.assert.ok(matchTexts.includes(JSON.stringify({ hello: 'world' })))
  t.assert.ok(matchTexts.includes(''))
})
