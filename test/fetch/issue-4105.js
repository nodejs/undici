'use strict'

const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')
const { fetch } = require('../..')
const { PerformanceObserver } = require('node:perf_hooks')
const { createDeferredPromise } = require('../../lib/util/promise')

const isAtLeastv22 = process.versions.node.split('.').map(Number)[0] >= 22

// https://github.com/nodejs/undici/issues/4105
test('markResourceTiming responseStatus is set', { skip: !isAtLeastv22 }, async (t) => {
  t.plan(1)

  const promise = createDeferredPromise()

  const server = createServer((req, res) => {
    res.statusCode = 200
    res.end('Hello World')
  }).listen(0)

  t.after(server.close.bind(server))
  await once(server, 'listening')

  new PerformanceObserver(items => {
    items.getEntries().forEach(entry => {
      t.assert.strictEqual(entry.responseStatus, 200)
      promise.resolve()
    })
  }).observe({ type: 'resource', buffered: true })

  const response = await fetch(`http://localhost:${server.address().port}`)
  await response.text()

  await promise.promise
})
