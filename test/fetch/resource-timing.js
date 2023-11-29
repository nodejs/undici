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
  t.plan(8)

  const obs = new PerformanceObserver(list => {
    const expectedResourceEntryName = `http://localhost:${server.address().port}/`

    const entries = list.getEntries()
    t.equal(entries.length, 1)
    const [entry] = entries
    t.same(entry.name, expectedResourceEntryName)
    t.strictSame(entry.entryType, 'resource')

    t.ok(entry.duration >= 0)
    t.ok(entry.startTime >= 0)

    const entriesByName = list.getEntriesByName(expectedResourceEntryName)
    t.equal(entriesByName.length, 1)
    t.strictSame(entriesByName[0], entry)

    obs.disconnect()
    performance.clearResourceTimings()
  })

  obs.observe({ entryTypes: ['resource'] })

  const server = createServer((req, res) => {
    res.end('ok')
  }).listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}`)
    t.strictSame('ok', await body.text())
  })

  t.teardown(server.close.bind(server))
})

test('should include encodedBodySize in performance entry', { skip }, (t) => {
  t.plan(4)
  const obs = new PerformanceObserver(list => {
    const [entry] = list.getEntries()
    t.equal(entry.encodedBodySize, 2)
    t.equal(entry.decodedBodySize, 2)
    t.equal(entry.transferSize, 2+300)

    obs.disconnect()
    performance.clearResourceTimings()
  })

  obs.observe({ entryTypes: ['resource'] })

  const server = createServer((req, res) => {
    res.end('ok')
  }).listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}`)
    t.strictSame('ok', await body.text())
  })

  t.teardown(server.close.bind(server))
})
