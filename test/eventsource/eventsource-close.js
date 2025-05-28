'use strict'

const assert = require('node:assert')
const events = require('node:events')
const http = require('node:http')
const { setTimeout } = require('node:timers/promises')
const { test, describe } = require('node:test')
const { EventSource } = require('../../lib/web/eventsource/eventsource')

describe('EventSource - close', () => {
  test('should not emit error when closing the EventSource Instance', async () => {
    const server = http.createServer((req, res) => {
      assert.strictEqual(req.headers.connection, 'keep-alive')
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('data: hello\n\n')
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = async () => {
      eventSourceInstance.close()
      await setTimeout(1000, { ref: false })
      server.close()
    }

    eventSourceInstance.onerror = () => {
      assert.fail('Should not have errored')
    }
  })

  test('should set readyState to CLOSED', async () => {
    const server = http.createServer((req, res) => {
      assert.strictEqual(req.headers.connection, 'keep-alive')
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('data: hello\n\n')
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = () => {
      assert.strictEqual(eventSourceInstance.readyState, EventSource.OPEN)
      eventSourceInstance.close()
      assert.strictEqual(eventSourceInstance.readyState, EventSource.CLOSED)
    }

    eventSourceInstance.onerror = () => {
      assert.fail('Should not have errored')
    }

    await setTimeout(2000, { ref: false })
    server.close()
  })
})
