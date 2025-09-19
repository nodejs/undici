'use strict'

const { once } = require('node:events')
const http = require('node:http')
const { test, describe, after } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const { EventSource, defaultReconnectionTime } = require('../../lib/web/eventsource/eventsource')
const FakeTimers = require('@sinonjs/fake-timers')

describe('EventSource - message', () => {
  test('Should not emit a message if only retry field was sent', async (t) => {
    t = tspl(t, { plan: 2 })

    const server = http.createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('retry: 100\n\n')
      setTimeout(() => res.end(), 100)
    })

    after(() => server.close())
    await once(server.listen(0), 'listening')
    const port = server.address().port

    const start = Date.now()
    let connectionCount = 0
    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = () => {
      if (++connectionCount === 2) {
        t.ok(Date.now() - start >= 100)
        t.ok(Date.now() - start < 1000)
        eventSourceInstance.close()
      }
    }
    eventSourceInstance.onmessage = () => {
      t.fail('Should not have received a message')
      eventSourceInstance.close()
    }

    await t.completed
  })

  test('Should not emit a message if no data is provided', async (t) => {
    t = tspl(t, { plan: 1 })

    const server = http.createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('event:message\n\n')
      setTimeout(() => res.end(), 100)
    })

    after(() => server.close())
    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)

    eventSourceInstance.onmessage = () => {
      t.fail('Should not have received a message')
      eventSourceInstance.close()
    }

    eventSourceInstance.close()
    t.ok('Should not have received a message')

    await t.completed
  })

  test('Should emit a custom type message if data is provided', async (t) => {
    t = tspl(t, { plan: 1 })

    const server = http.createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('event:custom\ndata:test\n\n')
      setTimeout(() => res.end(), 100)
    })

    after(() => server.close())
    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.addEventListener('custom', () => {
      t.ok(true)
      eventSourceInstance.close()
    })

    await t.completed
  })

  test('Should emit a message event if data is provided', async (t) => {
    t = tspl(t, { plan: 1 })

    const server = http.createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('data:test\n\n')
      setTimeout(() => res.end(), 100)
    })

    after(() => server.close())
    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.addEventListener('message', () => {
      t.ok(true)
      eventSourceInstance.close()
    })

    await t.completed
  })

  test('Should emit a message event if data as a field is provided', async (t) => {
    t = tspl(t, { plan: 1 })

    const server = http.createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('data\n\n')
      setTimeout(() => res.end(), 100)
    })

    after(() => server.close())
    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.addEventListener('message', () => {
      t.ok(true)
      eventSourceInstance.close()
    })

    await t.completed
  })

  test('Should emit a custom message event if data is empty', async (t) => {
    t = tspl(t, { plan: 1 })

    const server = http.createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('event:custom\ndata:\n\n')
      setTimeout(() => res.end(), 100)
    })

    after(() => server.close())
    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.addEventListener('custom', () => {
      t.ok(true)
      eventSourceInstance.close()
    })

    await t.completed
  })

  test('Should emit a message event if data is empty', async (t) => {
    t = tspl(t, { plan: 1 })

    const server = http.createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('data:\n\n')
      setTimeout(() => res.end(), 100)
    })

    after(() => server.close())
    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.addEventListener('message', () => {
      t.ok(true)
      eventSourceInstance.close()
    })

    await t.completed
  })

  test('Should emit a custom message event if data only as a field is provided', async (t) => {
    t = tspl(t, { plan: 1 })

    const server = http.createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('event:custom\ndata\n\n')
      setTimeout(() => res.end(), 100)
    })

    after(() => server.close())
    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.addEventListener('custom', () => {
      t.ok(true)
      eventSourceInstance.close()
    })

    await t.completed
  })

  test('Should not emit a custom type message if no data is provided', async (t) => {
    const clock = FakeTimers.install()
    after(() => clock.uninstall())

    t = tspl(t, { plan: 1 })

    const server = http.createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('event:custom\n\n')
      setTimeout(() => res.end(), 100)
    })

    let reconnectionCount = 0
    after(() => server.close())
    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = () => {
      if (++reconnectionCount === 2) {
        eventSourceInstance.close()
        t.ok(true)
      }
    }
    eventSourceInstance.addEventListener('custom', () => {
      t.fail('Should not have received a message')
      eventSourceInstance.close()
    })

    await once(eventSourceInstance, 'open')
    clock.tick(defaultReconnectionTime)
    await once(eventSourceInstance, 'error')

    clock.tick(defaultReconnectionTime)
    await once(eventSourceInstance, 'open')
    clock.tick(defaultReconnectionTime)
    await t.completed
  })
})
