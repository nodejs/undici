'use strict'

const assert = require('node:assert')
const events = require('node:events')
const http = require('node:http')
const { test, describe } = require('node:test')
const { EventSource, defaultReconnectionTime } = require('../../lib/web/eventsource/eventsource')

describe('EventSource - reconnect', () => {
  test('Should reconnect on connection close', async () => {
    const finishedPromise = {
      promise: undefined,
      resolve: undefined,
      reject: undefined
    }

    finishedPromise.promise = new Promise((resolve, reject) => {
      finishedPromise.resolve = resolve
      finishedPromise.reject = reject
    })

    const server = http.createServer((req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = async () => {
      eventSourceInstance.onopen = () => {
        server.close()
        eventSourceInstance.close()
        finishedPromise.resolve()
      }
    }

    await finishedPromise.promise
  })

  test('Should reconnect on with reconnection timeout', async () => {
    const finishedPromise = {
      promise: undefined,
      resolve: undefined,
      reject: undefined
    }

    finishedPromise.promise = new Promise((resolve, reject) => {
      finishedPromise.resolve = resolve
      finishedPromise.reject = reject
    })

    const server = http.createServer((req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const start = Date.now()
    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = async () => {
      eventSourceInstance.onopen = () => {
        assert.ok(Date.now() - start >= defaultReconnectionTime)
        server.close()
        eventSourceInstance.close()
        finishedPromise.resolve()
      }
    }

    await finishedPromise.promise
  })

  test('Should reconnect on with modified reconnection timeout', async () => {
    const finishedPromise = {
      promise: undefined,
      resolve: undefined,
      reject: undefined
    }

    finishedPromise.promise = new Promise((resolve, reject) => {
      finishedPromise.resolve = resolve
      finishedPromise.reject = reject
    })

    const server = http.createServer((req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('retry: 100\n\n')
      res.end()
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const start = Date.now()
    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = async () => {
      eventSourceInstance.onopen = () => {
        assert.ok(Date.now() - start >= 100)
        assert.ok(Date.now() - start < 1000)
        server.close()
        eventSourceInstance.close()
        finishedPromise.resolve()
      }
    }

    await finishedPromise.promise
  })

  test('Should reconnect and send lastEventId', async () => {
    let requestCount = 0

    const finishedPromise = {
      promise: undefined,
      resolve: undefined,
      reject: undefined
    }

    finishedPromise.promise = new Promise((resolve, reject) => {
      finishedPromise.resolve = resolve
      finishedPromise.reject = reject
    })

    const server = http.createServer((req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('id: 1337\n\n')
      if (requestCount++ !== 0) {
        assert.strictEqual(req.headers['last-event-id'], '1337')
      }
      res.end()
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const start = Date.now()
    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = async () => {
      eventSourceInstance.onopen = () => {
        assert.ok(Date.now() - start >= 3000)
        server.close()
        eventSourceInstance.close()
        finishedPromise.resolve()
      }
    }

    await finishedPromise.promise
  })
})
