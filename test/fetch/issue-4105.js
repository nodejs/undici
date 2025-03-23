'use strict'

const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')
const { fetch } = require('../..')
const { tspl } = require('@matteo.collina/tspl')
const { PerformanceObserver } = require('node:perf_hooks')

// https://github.com/nodejs/undici/issues/4105
test('markResourceTiming responseStatus is set', async (t) => {
  const { completed, deepEqual } = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.statusCode = 200
    res.end('Hello World')
  }).listen(3000)

  t.after(server.close.bind(server))
  await once(server, 'listening')

  new PerformanceObserver(items => {
    items.getEntries().forEach(entry => {
      deepEqual(entry.responseStatus, 200)
    })
  }).observe({ type: 'resource', buffered: true })

  const response = await fetch('http://localhost:3000')
  await response.text()

  await completed
})
