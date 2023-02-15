'use strict'

const { test } = require('tap')
const { createServer } = require('http')
const { nodeMajor, nodeMinor } = require('../../lib/core/util')
const { fetch } = require('../..')

const {
  PerformanceObserver,
  performance
} = require('perf_hooks')

const skip = nodeMajor < 18 || (nodeMajor === 18 && nodeMinor < 2)

test('should create a PerformanceResourceTiming after each fetch request', { skip }, (t) => {
  t.plan(4)
  const obs = new PerformanceObserver(list => {
    const entries = list.getEntries()
    t.equal(entries.length, 1)
    const [entry] = entries
    t.same(entry.name, {
      href: `http://localhost:${server.address().port}/`,
      origin: `http://localhost:${server.address().port}`,
      protocol: 'http'
    })
    t.strictSame(entry.entryType, 'resource')

    obs.disconnect()
    performance.clearResourceTimings()
  })

  obs.observe({ entryTypes: ['resource'] })

  const server = createServer((req, res) => {
    res.end('ok')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}`)
    t.strictSame('ok', await body.text())
  })
})
