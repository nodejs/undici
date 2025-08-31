'use strict'

const assert = require('node:assert')
const { once } = require('node:events')
const http = require('node:http')
const { test, describe, after } = require('node:test')
const { EventSource, defaultReconnectionTime } = require('../../lib/web/eventsource/eventsource')
const { createDeferredPromise } = require('../../lib/util/promise')
const FakeTimers = require('@sinonjs/fake-timers')

describe('EventSource - message', () => {
  test('Should not emit a message if only retry field was sent', async () => {
    const finishedPromise = createDeferredPromise()

    const server = http.createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('retry: 100\n\n')
      setTimeout(() => res.end(), 100)
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const start = Date.now()
    let connectionCount = 0
    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = () => {
      if (++connectionCount === 2) {
        assert.ok(Date.now() - start >= 100)
        assert.ok(Date.now() - start < 1000)
        eventSourceInstance.close()
        finishedPromise.resolve()
      }
    }
    eventSourceInstance.onmessage = () => {
      finishedPromise.reject('Should not have received a message')
      eventSourceInstance.close()
    }

    await finishedPromise.promise
    server.close()
  })

  test('Should not emit a message if no data is provided', async () => {
    const finishedPromise = createDeferredPromise()

    const server = http.createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('event:message\n\n')
      setTimeout(() => res.end(), 100)
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)

    eventSourceInstance.onmessage = () => {
      finishedPromise.reject('Should not have received a message')
      eventSourceInstance.close()
    }

    eventSourceInstance.close()
    finishedPromise.resolve()

    await finishedPromise.promise
    server.close()
  })

  test('Should emit a custom type message if data is provided', async () => {
    const finishedPromise = createDeferredPromise()

    const server = http.createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('event:custom\ndata:test\n\n')
      setTimeout(() => res.end(), 100)
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.addEventListener('custom', () => {
      finishedPromise.resolve()
      eventSourceInstance.close()
    })

    await finishedPromise.promise
    server.close()
  })

  test('Should emit a message event if data is provided', async () => {
    const finishedPromise = createDeferredPromise()

    const server = http.createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('data:test\n\n')
      setTimeout(() => res.end(), 100)
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.addEventListener('message', () => {
      finishedPromise.resolve()
      eventSourceInstance.close()
    })

    await finishedPromise.promise
    server.close()
  })

  test('Should emit a message event if data as a field is provided', async () => {
    const finishedPromise = createDeferredPromise()

    const server = http.createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('data\n\n')
      setTimeout(() => res.end(), 100)
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.addEventListener('message', () => {
      finishedPromise.resolve()
      eventSourceInstance.close()
    })

    await finishedPromise.promise
    server.close()
  })

  test('Should emit a custom message event if data is empty', async () => {
    const finishedPromise = createDeferredPromise()

    const server = http.createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('event:custom\ndata:\n\n')
      setTimeout(() => res.end(), 100)
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.addEventListener('custom', () => {
      finishedPromise.resolve()
      eventSourceInstance.close()
    })

    await finishedPromise.promise
    server.close()
  })

  test('Should emit a message event if data is empty', async () => {
    const finishedPromise = createDeferredPromise()

    const server = http.createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('data:\n\n')
      setTimeout(() => res.end(), 100)
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.addEventListener('message', () => {
      finishedPromise.resolve()
      eventSourceInstance.close()
    })

    await finishedPromise.promise
    server.close()
  })

  test('Should emit a custom message event if data only as a field is provided', async () => {
    const finishedPromise = createDeferredPromise()

    const server = http.createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('event:custom\ndata\n\n')
      setTimeout(() => res.end(), 100)
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.addEventListener('custom', () => {
      finishedPromise.resolve()
      eventSourceInstance.close()
    })

    await finishedPromise.promise
    server.close()
  })

  test('Should not emit a custom type message if no data is provided', async () => {
    const clock = FakeTimers.install()
    after(() => clock.uninstall())

    const finishedPromise = createDeferredPromise()

    const server = http.createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('event:custom\n\n')
      setTimeout(() => res.end(), 100)
    })

    let reconnectionCount = 0
    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = () => {
      if (++reconnectionCount === 2) {
        eventSourceInstance.close()
        finishedPromise.resolve()
      }
    }
    eventSourceInstance.addEventListener('custom', () => {
      finishedPromise.reject('Should not have received a message')
      eventSourceInstance.close()
    })

    await once(eventSourceInstance, 'open')
    clock.tick(defaultReconnectionTime)
    await once(eventSourceInstance, 'error')

    clock.tick(defaultReconnectionTime)
    await once(eventSourceInstance, 'open')
    clock.tick(defaultReconnectionTime)
    await finishedPromise.promise
    server.close()
  })
})
