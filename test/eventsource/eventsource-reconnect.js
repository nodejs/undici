'use strict'

const assert = require('node:assert')
const { once } = require('node:events')
const http = require('node:http')
const { test, describe, after } = require('node:test')
const FakeTimers = require('@sinonjs/fake-timers')
const { EventSource, defaultReconnectionTime } = require('../../lib/web/eventsource/eventsource')
const { createDeferredPromise } = require('../../lib/util/promise')

describe('EventSource - reconnect', () => {
  test('Should reconnect on connection closed by server', async () => {
    const clock = FakeTimers.install()
    after(() => clock.uninstall())

    const finishedPromise = createDeferredPromise()

    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    let connectionCount = 0
    eventSourceInstance.onopen = () => {
      if (++connectionCount === 2) {
        eventSourceInstance.close()
        finishedPromise.resolve()
      }
    }

    await once(eventSourceInstance, 'open')

    clock.tick(10)
    await once(eventSourceInstance, 'error')

    clock.tick(defaultReconnectionTime)

    await finishedPromise.promise
    server.close()
  })

  test('Should reconnect on with reconnection timeout', async () => {
    const clock = FakeTimers.install()
    after(() => clock.uninstall())

    const finishedPromise = createDeferredPromise()

    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const start = Date.now()
    const eventSourceInstance = new EventSource(`http://localhost:${port}`)

    let connectionCount = 0
    eventSourceInstance.onopen = () => {
      if (++connectionCount === 2) {
        assert.ok(Date.now() - start >= defaultReconnectionTime)
        eventSourceInstance.close()
        finishedPromise.resolve()
      }
    }

    await once(eventSourceInstance, 'open')

    clock.tick(10)
    await once(eventSourceInstance, 'error')

    clock.tick(defaultReconnectionTime)

    await finishedPromise.promise
    server.close()
  })

  test('Should reconnect on with modified reconnection timeout', async () => {
    const clock = FakeTimers.install()
    after(() => clock.uninstall())

    const finishedPromise = createDeferredPromise()

    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('retry: 100\n\n')
      res.end()
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const start = Date.now()
    const eventSourceInstance = new EventSource(`http://localhost:${port}`)

    let connectionCount = 0
    eventSourceInstance.onopen = () => {
      if (++connectionCount === 2) {
        assert.ok(Date.now() - start >= 100)
        assert.ok(Date.now() - start < 1000)
        eventSourceInstance.close()
        finishedPromise.resolve()
      }
    }

    await once(eventSourceInstance, 'open')

    clock.tick(10)
    await once(eventSourceInstance, 'error')

    clock.tick(100)

    await finishedPromise.promise
    server.close()
  })

  test('Should reconnect and send lastEventId', async () => {
    const clock = FakeTimers.install()
    after(() => clock.uninstall())

    let requestCount = 0
    const finishedPromise = createDeferredPromise()

    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('id: 1337\n\n')
      if (requestCount++ !== 0) {
        assert.strictEqual(req.headers['last-event-id'], '1337')
      }
      res.end()
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const start = Date.now()
    const eventSourceInstance = new EventSource(`http://localhost:${port}`)

    let connectionCount = 0
    eventSourceInstance.onopen = () => {
      if (++connectionCount === 2) {
        assert.ok(Date.now() - start >= defaultReconnectionTime)
        eventSourceInstance.close()
        finishedPromise.resolve()
      }
    }

    await once(eventSourceInstance, 'open')

    clock.tick(10)
    await once(eventSourceInstance, 'error')

    clock.tick(defaultReconnectionTime)

    await finishedPromise.promise
    server.close()
  })
})
