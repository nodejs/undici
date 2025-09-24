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

  test('Should reconnect and send lastEventId', async (t) => {
    t.plan(1)
    const clock = FakeTimers.install()
    after(() => clock.uninstall())

    let requestCount = 0

    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('id: 1337\n\n')
      if (++requestCount === 2) {
        t.assert.strictEqual(req.headers['last-event-id'], '1337')
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
  })
})
