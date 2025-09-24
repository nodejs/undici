'use strict'

const { once } = require('node:events')
const http = require('node:http')
const { test, describe } = require('node:test')
const { EventSource } = require('../../lib/web/eventsource/eventsource')

describe('EventSource - constructor stringify', () => {
  test('should stringify argument', async (t) => {
    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      t.assert.strictEqual(req.headers.connection, 'keep-alive')
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource({ toString: function () { return `http://localhost:${port}` } })
    eventSourceInstance.onopen = () => {
      eventSourceInstance.close()
      server.close()
    }

    eventSourceInstance.onerror = () => {
      t.assert.fail('Should not have errored')
    }
  })
})
