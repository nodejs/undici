'use strict'

const assert = require('node:assert')
const events = require('node:events')
const http = require('node:http')
const { test, describe } = require('node:test')
const { EventSource } = require('../../lib/eventsource/eventsource')

describe('EventSource - redirecting', () => {
  [301, 302, 307, 308].forEach((statusCode) => {
    test(`Should redirect on ${statusCode} status code`, async () => {
      const server = http.createServer((req, res) => {
        if (res.req.url === '/redirect') {
          res.writeHead(statusCode, undefined, { Location: '/target' })
          res.end()
        } else if (res.req.url === '/target') {
          res.writeHead(200, 'dummy', { 'Content-Type': 'text/event-stream' })
          res.end()
        }
      })

      server.listen(0)
      await events.once(server, 'listening')

      const port = server.address().port

      const eventSourceInstance = new EventSource(`http://localhost:${port}/redirect`)
      eventSourceInstance.onerror = (e) => {
        assert.fail('Should not have errored')
      }
      eventSourceInstance.onopen = () => {
        // assert.strictEqual(eventSourceInstance.url, `http://localhost:${port}/target`)
        eventSourceInstance.close()
        server.close()
      }
    })
  })

  test('Stop trying to connect when getting a 204 response', async () => {
    const server = http.createServer((req, res) => {
      if (res.req.url === '/redirect') {
        res.writeHead(301, undefined, { Location: '/target' })
        res.end()
      } else if (res.req.url === '/target') {
        res.writeHead(204, 'OK')
        res.end()
      }
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}/redirect`)
    eventSourceInstance.onerror = (event) => {
      assert.strictEqual(event.message, 'No content')
      // TODO: fetching does not set the url properly?
      // assert.strictEqual(eventSourceInstance.url, `http://localhost:${port}/target`)
      assert.strictEqual(eventSourceInstance.readyState, EventSource.CLOSED)
      server.close()
    }
    eventSourceInstance.onopen = () => {
      assert.fail('Should not have opened')
    }
  })

  test('Throw when missing a Location header', async () => {
    const server = http.createServer((req, res) => {
      if (res.req.url === '/redirect') {
        res.writeHead(301, undefined)
        res.end()
      } else if (res.req.url === '/target') {
        res.writeHead(204, 'OK')
        res.end()
      }
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}/redirect`)
    eventSourceInstance.onerror = () => {
      assert.strictEqual(eventSourceInstance.url, `http://localhost:${port}/redirect`)
      assert.strictEqual(eventSourceInstance.readyState, EventSource.CLOSED)
      server.close()
    }
  })
})
