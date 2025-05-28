'use strict'

const { test } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const { createServer } = require('node:http')
const { fetch } = require('../..')
const { closeServerAsPromise } = require('../utils/node-http')

const {
  PerformanceObserver,
  performance
} = require('node:perf_hooks')

test('should create a PerformanceResourceTiming after each fetch request', (t, done) => {
  const { strictEqual, ok, deepStrictEqual } = tspl(t, { plan: 8 })

  const obs = new PerformanceObserver(list => {
    const expectedResourceEntryName = `http://localhost:${server.address().port}/`

    const entries = list.getEntries()
    strictEqual(entries.length, 1)
    const [entry] = entries
    strictEqual(entry.name, expectedResourceEntryName)
    strictEqual(entry.entryType, 'resource')

    ok(entry.duration >= 0)
    ok(entry.startTime >= 0)

    const entriesByName = list.getEntriesByName(expectedResourceEntryName)
    strictEqual(entriesByName.length, 1)
    deepStrictEqual(entriesByName[0], entry)

    obs.disconnect()
    performance.clearResourceTimings()
    done()
  })

  obs.observe({ entryTypes: ['resource'] })

  const server = createServer((req, res) => {
    res.end('ok')
  }).listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}`)
    strictEqual('ok', await body.text())
  })

  t.after(closeServerAsPromise(server))
})

test('should include encodedBodySize in performance entry', (t, done) => {
  const { strictEqual } = tspl(t, { plan: 4 })
  const obs = new PerformanceObserver(list => {
    const [entry] = list.getEntries()
    strictEqual(entry.encodedBodySize, 2)
    strictEqual(entry.decodedBodySize, 2)
    strictEqual(entry.transferSize, 2 + 300)

    obs.disconnect()
    performance.clearResourceTimings()
    done()
  })

  obs.observe({ entryTypes: ['resource'] })

  const server = createServer((req, res) => {
    res.end('ok')
  }).listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}`)
    strictEqual('ok', await body.text())
  })

  t.after(closeServerAsPromise(server))
})

test('timing entries should be in order', (t, done) => {
  const { ok, strictEqual } = tspl(t, { plan: 13 })
  const obs = new PerformanceObserver(list => {
    const [entry] = list.getEntries()

    ok(entry.startTime > 0)
    ok(entry.fetchStart >= entry.startTime)
    ok(entry.domainLookupStart >= entry.fetchStart)
    ok(entry.domainLookupEnd >= entry.domainLookupStart)
    ok(entry.connectStart >= entry.domainLookupEnd)
    ok(entry.connectEnd >= entry.connectStart)
    ok(entry.requestStart >= entry.connectEnd)
    ok(entry.responseStart >= entry.requestStart)
    ok(entry.responseEnd >= entry.responseStart)
    ok(entry.duration > 0)

    ok(entry.redirectStart === 0)
    ok(entry.redirectEnd === 0)

    obs.disconnect()
    performance.clearResourceTimings()
    done()
  })

  obs.observe({ entryTypes: ['resource'] })

  const server = createServer((req, res) => {
    res.end('ok')
  }).listen(0, async () => {
    const body = await fetch(`http://localhost:${server.address().port}/redirect`)
    strictEqual('ok', await body.text())
  })

  t.after(closeServerAsPromise(server))
})

test('redirect timing entries should be included when redirecting', (t, done) => {
  const { ok, strictEqual } = tspl(t, { plan: 4 })
  const obs = new PerformanceObserver(list => {
    const [entry] = list.getEntries()

    ok(entry.redirectStart >= entry.startTime)
    ok(entry.redirectEnd >= entry.redirectStart)
    ok(entry.connectStart >= entry.redirectEnd)

    obs.disconnect()
    performance.clearResourceTimings()
    done()
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
    strictEqual('ok', await body.text())
  })

  t.after(closeServerAsPromise(server))
})
