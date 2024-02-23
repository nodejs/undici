'use strict'

const assert = require('node:assert')
const events = require('node:events')
const http = require('node:http')
const { test, describe } = require('node:test')
const { EventSource } = require('../../lib/web/eventsource/eventsource')

describe('EventSource - status error', () => {
  [204, 205, 210, 299, 404, 410, 503].forEach((statusCode) => {
    test(`Should error on ${statusCode} status code`, async () => {
      const server = http.createServer((req, res) => {
        res.writeHead(statusCode, 'dummy', { 'Content-Type': 'text/event-stream' })
        res.end()
      })

      server.listen(0)
      await events.once(server, 'listening')

      const port = server.address().port

      const eventSourceInstance = new EventSource(`http://localhost:${port}`)
      eventSourceInstance.onerror = (e) => {
        assert.strictEqual(this.readyState, this.CLOSED)
        eventSourceInstance.close()
        server.close()
      }
      eventSourceInstance.onmessage = () => {
        assert.fail('Should not have received a message')
      }
      eventSourceInstance.onopen = () => {
        assert.fail('Should not have opened')
      }
    })
  })
})
