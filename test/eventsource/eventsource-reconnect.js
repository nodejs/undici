'use strict'

const assert = require('node:assert')
const { once } = require('node:events')
const http = require('node:http')
const { test, describe, after } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const FakeTimers = require('@sinonjs/fake-timers')
const { EventSource, defaultReconnectionTime } = require('../../lib/web/eventsource/eventsource')

describe('EventSource - reconnect', () => {
  test('Should reconnect on connection closed by server', async (t) => {
    t = tspl(t, { plan: 1 })

    const clock = FakeTimers.install()
    after(() => clock.uninstall())

    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })
    after(() => server.close())

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    let connectionCount = 0
    eventSourceInstance.onopen = () => {
      if (++connectionCount === 2) {
        eventSourceInstance.close()
        t.ok(true)
      }
    }

    await once(eventSourceInstance, 'open')

    clock.tick(10)
    await once(eventSourceInstance, 'error')

    clock.tick(defaultReconnectionTime)

    await t.completed
  })

  test('Should reconnect on with reconnection timeout', async (t) => {
    t = tspl(t, { plan: 1 })
    const clock = FakeTimers.install()
    after(() => clock.uninstall())

    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })
    after(() => server.close())
    await once(server.listen(0), 'listening')
    const port = server.address().port

    const start = Date.now()
    const eventSourceInstance = new EventSource(`http://localhost:${port}`)

    let connectionCount = 0
    eventSourceInstance.onopen = () => {
      if (++connectionCount === 2) {
        assert.ok(Date.now() - start >= defaultReconnectionTime)
        eventSourceInstance.close()
        t.ok(true)
      }
    }

    await once(eventSourceInstance, 'open')

    clock.tick(10)
    await once(eventSourceInstance, 'error')

    clock.tick(defaultReconnectionTime)

    await t.completed
  })

  test('Should reconnect on with modified reconnection timeout', async (t) => {
    t = tspl(t, { plan: 1 })
    const clock = FakeTimers.install()
    after(() => clock.uninstall())

    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('retry: 100\n\n')
      res.end()
    })
    after(() => server.close())
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
        t.ok(true)
      }
    }

    await once(eventSourceInstance, 'open')

    clock.tick(10)
    await once(eventSourceInstance, 'error')

    clock.tick(100)

    await t.completed
  })

  test('Should reconnect and send lastEventId', async (t) => {
    t = tspl(t, { plan: 1 })
    const clock = FakeTimers.install()
    after(() => clock.uninstall())

    let requestCount = 0

    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('id: 1337\n\n')
      if (++requestCount === 2) {
        t.strictEqual(req.headers['last-event-id'], '1337')
      }
      res.end()
    })
    after(() => server.close())
    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)

    await once(eventSourceInstance, 'open')

    clock.tick(10)
    await once(eventSourceInstance, 'error')

    clock.tick(defaultReconnectionTime)
    await once(eventSourceInstance, 'open')

    await t.completed
  })
})
