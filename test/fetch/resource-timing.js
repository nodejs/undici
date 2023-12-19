'use strict'

const { test } = require('tap')
const { createServer } = require('http')
const { nodeMajor, nodeMinor } = require('../../lib/core/util')
const { fetch } = require('../..')

const {
  PerformanceObserver,
  performance
} = require('perf_hooks')

const skip = nodeMajor === 18 && nodeMinor < 2

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
    t.equal(entry.transferSize, 2 + 300)

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

test('timing entries should be in order', { skip }, (t) => {
  t.plan(13)
  const obs = new PerformanceObserver(list => {
    const [entry] = list.getEntries()

    t.ok(entry.startTime > 0)
    t.ok(entry.fetchStart >= entry.startTime)
    t.ok(entry.domainLookupStart >= entry.fetchStart)
    t.ok(entry.domainLookupEnd >= entry.domainLookupStart)
    t.ok(entry.connectStart >= entry.domainLookupEnd)
    t.ok(entry.connectEnd >= entry.connectStart)
    t.ok(entry.requestStart >= entry.connectEnd)
    t.ok(entry.responseStart >= entry.requestStart)
    t.ok(entry.responseEnd >= entry.responseStart)
    t.ok(entry.duration > 0)

    t.ok(entry.redirectStart === 0)
    t.ok(entry.redirectEnd === 0)

    obs.disconnect()
    performance.clearResourceTimings()
  })

  obs.observe({ entryTypes: ['resource'] })

  const server = createServer((req, res) => {
    res.end('ok')
  }).listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}/redirect`)
    t.strictSame('ok', await body.text())
  })

  t.teardown(server.close.bind(server))
})

test('redirect timing entries should be included when redirecting', { skip }, (t) => {
  t.plan(4)
  const obs = new PerformanceObserver(list => {
    const [entry] = list.getEntries()

    t.ok(entry.redirectStart >= entry.startTime)
    t.ok(entry.redirectEnd >= entry.redirectStart)
    t.ok(entry.connectStart >= entry.redirectEnd)

    obs.disconnect()
    performance.clearResourceTimings()
  })

  obs.observe({ entryTypes: ['resource'] })

  const server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.statusCode = 307
      res.setHeader('location', '/redirect/')
      res.end()
      return
    }
    res.end('ok')
  }).listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}/redirect`)
    t.strictSame('ok', await body.text())
  })

  t.teardown(server.close.bind(server))
})
