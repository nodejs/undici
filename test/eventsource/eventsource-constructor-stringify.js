'use strict'

const assert = require('node:assert')
const events = require('node:events')
const http = require('node:http')
const { test, describe } = require('node:test')
const { EventSource } = require('../../lib/web/eventsource/eventsource')

describe('EventSource - constructor stringify', () => {
  test('should stringify argument', async () => {
    const server = http.createServer((req, res) => {
      assert.strictEqual(req.headers.connection, 'keep-alive')
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource({ toString: function () { return `http://localhost:${port}` } })
    eventSourceInstance.onopen = () => {
      eventSourceInstance.close()
      server.close()
    }

    eventSourceInstance.onerror = () => {
      assert.fail('Should not have errored')
    }
  })
})
