'use strict'

const { once } = require('node:events')
const http = require('node:http')
const { test, describe, after } = require('node:test')
const FakeTimers = require('@sinonjs/fake-timers')
const { EventSource, defaultReconnectionTime } = require('../../lib/web/eventsource/eventsource')

describe('EventSource - reconnect', () => {
  test('Should reconnect on connection closed by server', (t, done) => {
    t.plan(1)

    const clock = FakeTimers.install()
    after(() => clock.uninstall())

    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })
    after(() => server.close())

    server.listen(0, async () => {
      const port = server.address().port

      const eventSourceInstance = new EventSource(`http://localhost:${port}`)
      let connectionCount = 0
      eventSourceInstance.onopen = () => {
        if (++connectionCount === 2) {
          eventSourceInstance.close()
          t.assert.ok(true)
          done()
        }
      }

      await once(eventSourceInstance, 'open')

      clock.tick(10)
      await once(eventSourceInstance, 'error')

      clock.tick(defaultReconnectionTime)
    })
  })

  test('Should reconnect on with reconnection timeout', (t, done) => {
    t.plan(2)
    const clock = FakeTimers.install()
    after(() => clock.uninstall())

    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })
    after(() => server.close())

    server.listen(0, async () => {
      const port = server.address().port

      const start = Date.now()
      const eventSourceInstance = new EventSource(`http://localhost:${port}`)

      let connectionCount = 0
      eventSourceInstance.onopen = () => {
        if (++connectionCount === 2) {
          t.assert.ok(Date.now() - start >= defaultReconnectionTime)
          eventSourceInstance.close()
          t.assert.ok(true)

          done()
        }
      }

      await once(eventSourceInstance, 'open')

      clock.tick(10)
      await once(eventSourceInstance, 'error')

      clock.tick(defaultReconnectionTime)
    })
  })

  test('Should reconnect on with modified reconnection timeout', (t, done) => {
    t.plan(3)
    const clock = FakeTimers.install()
    after(() => clock.uninstall())

    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('retry: 100\n\n')
      res.end()
    })
    after(() => server.close())

    server.listen(0, async () => {
      const port = server.address().port

      const start = Date.now()
      const eventSourceInstance = new EventSource(`http://localhost:${port}`)

      let connectionCount = 0
      eventSourceInstance.onopen = () => {
        if (++connectionCount === 2) {
          t.assert.ok(Date.now() - start >= 100)
          t.assert.ok(Date.now() - start < 1000)
          eventSourceInstance.close()
          t.assert.ok(true)

          done()
        }
      }

      await once(eventSourceInstance, 'open')

      clock.tick(10)
      await once(eventSourceInstance, 'error')

      clock.tick(100)
    })
  })

  for (const [name, retry, options] of [
    ['retry field larger than 2^31-1', '2147483648', undefined],
    ['retry field that parses to Infinity', '9'.repeat(400), undefined],
    ['reconnectionTime option larger than 2^31-1', undefined, { node: { reconnectionTime: 2 ** 32 - 1 } }]
  ]) {
    test(`Should not reconnect immediately with a ${name}`, async (t) => {
      let requestCount = 0

      const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
        requestCount++
        res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
        res.end(retry === undefined ? '' : `retry: ${retry}\n\n`)
      })
      await once(server.listen(0), 'listening')

      const eventSourceInstance = new EventSource(`http://localhost:${server.address().port}`, options)
      t.after(() => {
        eventSourceInstance.close()
        server.close()
      })

      await once(eventSourceInstance, 'error')
      // Without clamping, setTimeout fires after 1 ms and the client
      // reconnects hundreds of times in this window.
      await new Promise((resolve) => setTimeout(resolve, 200))

      t.assert.strictEqual(requestCount, 1)
      t.assert.strictEqual(eventSourceInstance.readyState, EventSource.CONNECTING)
    })
  }

  test('Should schedule the reconnect at the maximum setTimeout delay with a retry field larger than 2^31-1', async (t) => {
    // Advancing a fake clock by ~24 days would also fire undici's own
    // connection timers, so record the reconnect delay instead.
    const originalSetTimeout = globalThis.setTimeout
    const longDelays = []
    t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => {
      if (delay > 60_000) {
        longDelays.push(delay)
        return { unref () { return this } }
      }
      return originalSetTimeout(callback, delay, ...args)
    })

    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end('retry: 2147483648\n\n')
    })
    await once(server.listen(0), 'listening')

    const eventSourceInstance = new EventSource(`http://localhost:${server.address().port}`)
    t.after(() => {
      eventSourceInstance.close()
      server.close()
    })

    await once(eventSourceInstance, 'error')

    t.assert.deepStrictEqual(longDelays, [2 ** 31 - 1])
  })

  test('Should reconnect without an invalid lastEventId', { timeout: 2000 }, async (t) => {
    let requestCount = 0
    let secondRequestHeader
    let resolveSecondRequest
    let rejectSecondRequest
    const secondRequest = new Promise((resolve, reject) => {
      resolveSecondRequest = resolve
      rejectSecondRequest = reject
    })

    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      requestCount++
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })

      if (requestCount === 1) {
        res.end('id: \x01poison\nretry: 0\n\n')
      } else {
        secondRequestHeader = req.headers['last-event-id']
        res.end()
        resolveSecondRequest()
      }
    })
    await once(server.listen(0), 'listening')

    const eventSourceInstance = new EventSource(`http://localhost:${server.address().port}`)
    t.after(() => {
      eventSourceInstance.close()
      server.close()
    })

    let errorCount = 0
    eventSourceInstance.onerror = () => {
      if (++errorCount === 5) {
        rejectSecondRequest(new Error('EventSource repeatedly failed before reconnecting'))
      }
    }

    await secondRequest

    t.assert.strictEqual(requestCount, 2)
    t.assert.strictEqual(secondRequestHeader, undefined)
  })

  test('Should reconnect and UTF-8 encode lastEventId', async (t) => {
    t.plan(1)
    const clock = FakeTimers.install()
    after(() => clock.uninstall())

    let requestCount = 0

    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('id: …\n\n')
      if (++requestCount === 2) {
        t.assert.strictEqual(req.headers['last-event-id'], Buffer.from('…').toString('latin1'))
      }
      res.end()
    })
    after(() => server.close())
    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    t.after(() => eventSourceInstance.close())

    await once(eventSourceInstance, 'open')

    clock.tick(10)
    await once(eventSourceInstance, 'error')

    clock.tick(defaultReconnectionTime)
    await once(eventSourceInstance, 'open')
  })
})
