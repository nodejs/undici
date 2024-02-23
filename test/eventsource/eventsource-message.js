'use strict'

const assert = require('node:assert')
const events = require('node:events')
const http = require('node:http')
const { setTimeout } = require('node:timers/promises')
const { test, describe } = require('node:test')
const { EventSource } = require('../../lib/web/eventsource/eventsource')

describe('EventSource - message', () => {
  test('Should not emit a message if only retry field was sent', async () => {
    const finishedPromise = {
      promise: undefined,
      resolve: undefined,
      reject: undefined
    }

    finishedPromise.promise = new Promise((resolve, reject) => {
      finishedPromise.resolve = resolve
      finishedPromise.reject = reject
    })

    const server = http.createServer(async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('retry: 100\n\n')
      await setTimeout(100)

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
    eventSourceInstance.onmessage = () => {
      finishedPromise.reject('Should not have received a message')
      eventSourceInstance.close()
      server.close()
    }

    await setTimeout(500)

    await finishedPromise.promise
  })

  test('Should not emit a message if no data is provided', async () => {
    const finishedPromise = {
      promise: undefined,
      resolve: undefined,
      reject: undefined
    }

    finishedPromise.promise = new Promise((resolve, reject) => {
      finishedPromise.resolve = resolve
      finishedPromise.reject = reject
    })

    const server = http.createServer(async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('event:message\n\n')
      await setTimeout(100)

      res.end()
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)

    eventSourceInstance.onmessage = () => {
      finishedPromise.reject('Should not have received a message')
      eventSourceInstance.close()
      server.close()
    }

    await setTimeout(500)
    server.close()
    eventSourceInstance.close()
    finishedPromise.resolve()

    await finishedPromise.promise
  })

  test('Should emit a custom type message if data is provided', async () => {
    const finishedPromise = {
      promise: undefined,
      resolve: undefined,
      reject: undefined
    }

    finishedPromise.promise = new Promise((resolve, reject) => {
      finishedPromise.resolve = resolve
      finishedPromise.reject = reject
    })

    const server = http.createServer(async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('event:custom\ndata:test\n\n')
      await setTimeout(100)

      res.end()
    })

    server.listen(0)

    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.addEventListener('custom', () => {
      finishedPromise.resolve()
      eventSourceInstance.close()
      server.close()
    })

    await setTimeout(500)

    await finishedPromise.promise
  })

  test('Should emit a message event if data is provided', async () => {
    const finishedPromise = {
      promise: undefined,
      resolve: undefined,
      reject: undefined
    }

    finishedPromise.promise = new Promise((resolve, reject) => {
      finishedPromise.resolve = resolve
      finishedPromise.reject = reject
    })

    const server = http.createServer(async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('data:test\n\n')
      await setTimeout(100)

      res.end()
    })

    server.listen(0)

    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.addEventListener('message', () => {
      finishedPromise.resolve()
      eventSourceInstance.close()
      server.close()
    })

    await setTimeout(500)

    await finishedPromise.promise
  })

  test('Should emit a message event if data as a field is provided', async () => {
    const finishedPromise = {
      promise: undefined,
      resolve: undefined,
      reject: undefined
    }

    finishedPromise.promise = new Promise((resolve, reject) => {
      finishedPromise.resolve = resolve
      finishedPromise.reject = reject
    })

    const server = http.createServer(async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('data\n\n')
      await setTimeout(100)

      res.end()
    })

    server.listen(0)

    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.addEventListener('message', () => {
      finishedPromise.resolve()
      eventSourceInstance.close()
      server.close()
    })

    await setTimeout(500)

    await finishedPromise.promise
  })

  test('Should emit a custom message event if data is empty', async () => {
    const finishedPromise = {
      promise: undefined,
      resolve: undefined,
      reject: undefined
    }

    finishedPromise.promise = new Promise((resolve, reject) => {
      finishedPromise.resolve = resolve
      finishedPromise.reject = reject
    })

    const server = http.createServer(async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('event:custom\ndata:\n\n')
      await setTimeout(100)

      res.end()
    })

    server.listen(0)

    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.addEventListener('custom', () => {
      finishedPromise.resolve()
      eventSourceInstance.close()
      server.close()
    })

    await setTimeout(500)

    await finishedPromise.promise
  })

  test('Should emit a message event if data is empty', async () => {
    const finishedPromise = {
      promise: undefined,
      resolve: undefined,
      reject: undefined
    }

    finishedPromise.promise = new Promise((resolve, reject) => {
      finishedPromise.resolve = resolve
      finishedPromise.reject = reject
    })

    const server = http.createServer(async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('data:\n\n')
      await setTimeout(100)

      res.end()
    })

    server.listen(0)

    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.addEventListener('message', () => {
      finishedPromise.resolve()
      eventSourceInstance.close()
      server.close()
    })

    await setTimeout(500)

    await finishedPromise.promise
  })

  test('Should emit a custom message event if data only as a field is provided', async () => {
    const finishedPromise = {
      promise: undefined,
      resolve: undefined,
      reject: undefined
    }

    finishedPromise.promise = new Promise((resolve, reject) => {
      finishedPromise.resolve = resolve
      finishedPromise.reject = reject
    })

    const server = http.createServer(async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('event:custom\ndata\n\n')
      await setTimeout(100)

      res.end()
    })

    server.listen(0)

    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.addEventListener('custom', () => {
      finishedPromise.resolve()
      eventSourceInstance.close()
      server.close()
    })

    await setTimeout(500)

    await finishedPromise.promise
  })

  test('Should not emit a custom type message if no data is provided', async () => {
    const finishedPromise = {
      promise: undefined,
      resolve: undefined,
      reject: undefined
    }

    finishedPromise.promise = new Promise((resolve, reject) => {
      finishedPromise.resolve = resolve
      finishedPromise.reject = reject
    })

    const server = http.createServer(async (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('event:custom\n\n')
      await setTimeout(100)

      res.end()
    })

    server.listen(0)

    let reconnectionCount = 0
    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = async () => {
      eventSourceInstance.onopen = () => {
        if (++reconnectionCount === 2) {
          server.close()
          eventSourceInstance.close()
          finishedPromise.resolve()
        }
      }
    }
    eventSourceInstance.addEventListener('custom', () => {
      finishedPromise.reject('Should not have received a message')
      eventSourceInstance.close()
      server.close()
    })

    await setTimeout(500)

    await finishedPromise.promise
  })
})
