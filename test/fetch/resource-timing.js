'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const { fetch } = require('../..')
const { closeServerAsPromise } = require('../utils/node-http')

const {
  PerformanceObserver,
  performance
} = require('node:perf_hooks')

test('should create a PerformanceResourceTiming after each fetch request', (t, done) => {
  t.plan(8)

  const obs = new PerformanceObserver(list => {
    const expectedResourceEntryName = `http://localhost:${server.address().port}/`

    const entries = list.getEntries()
    t.assert.strictEqual(entries.length, 1)
    const [entry] = entries
    t.assert.strictEqual(entry.name, expectedResourceEntryName)
    t.assert.strictEqual(entry.entryType, 'resource')

    t.assert.ok(entry.duration >= 0)
    t.assert.ok(entry.startTime >= 0)

    const entriesByName = list.getEntriesByName(expectedResourceEntryName)
    t.assert.strictEqual(entriesByName.length, 1)
    t.assert.deepStrictEqual(entriesByName[0], entry)

    obs.disconnect()
    performance.clearResourceTimings()
    done()
  })

  obs.observe({ entryTypes: ['resource'] })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('ok')
  }).listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}`)
    t.assert.strictEqual('ok', await body.text())
  })

  t.after(closeServerAsPromise(server))
})

test('should include encodedBodySize in performance entry', (t, done) => {
  t.plan(4)
  const obs = new PerformanceObserver(list => {
    const [entry] = list.getEntries()
    t.assert.strictEqual(entry.encodedBodySize, 2)
    t.assert.strictEqual(entry.decodedBodySize, 2)
    t.assert.strictEqual(entry.transferSize, 2 + 300)

    obs.disconnect()
    performance.clearResourceTimings()
    done()
  })

  obs.observe({ entryTypes: ['resource'] })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('ok')
  }).listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}`)
    t.assert.strictEqual('ok', await body.text())
  })

  t.after(closeServerAsPromise(server))
})

test('timing entries should be in order', (t, done) => {
  t.plan(13)
  const obs = new PerformanceObserver(list => {
    const [entry] = list.getEntries()

    t.assert.ok(entry.startTime > 0)
    t.assert.ok(entry.fetchStart >= entry.startTime)
    t.assert.ok(entry.domainLookupStart >= entry.fetchStart)
    t.assert.ok(entry.domainLookupEnd >= entry.domainLookupStart)
    t.assert.ok(entry.connectStart >= entry.domainLookupEnd)
    t.assert.ok(entry.connectEnd >= entry.connectStart)
    t.assert.ok(entry.requestStart >= entry.connectEnd)
    t.assert.ok(entry.responseStart >= entry.requestStart)
    t.assert.ok(entry.responseEnd >= entry.responseStart)
    t.assert.ok(entry.duration > 0)

    t.assert.ok(entry.redirectStart === 0)
    t.assert.ok(entry.redirectEnd === 0)

    obs.disconnect()
    performance.clearResourceTimings()
    done()
  })

  obs.observe({ entryTypes: ['resource'] })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('ok')
  }).listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}/redirect`)
    t.assert.strictEqual('ok', await body.text())
  })

  t.after(closeServerAsPromise(server))
})

test('redirect timing entries should be included when redirecting', (t, done) => {
  t.plan(4)
  const obs = new PerformanceObserver(list => {
    const [entry] = list.getEntries()

    t.assert.ok(entry.redirectStart >= entry.startTime)
    t.assert.ok(entry.redirectEnd >= entry.redirectStart)
    t.assert.ok(entry.connectStart >= entry.redirectEnd)

    obs.disconnect()
    performance.clearResourceTimings()
    done()
  })

  obs.observe({ entryTypes: ['resource'] })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    if (req.url === '/redirect') {
      res.statusCode = 307
      res.setHeader('location', '/redirect/')
      res.end()
      return
    }
    res.end('ok')
  }).listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}/redirect`)
    t.assert.strictEqual('ok', await body.text())
  })

  t.after(closeServerAsPromise(server))
})
