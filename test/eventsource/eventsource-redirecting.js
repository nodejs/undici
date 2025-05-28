'use strict'

const assert = require('node:assert')
const events = require('node:events')
const http = require('node:http')
const { test, describe } = require('node:test')
const { EventSource } = require('../../lib/web/eventsource/eventsource')

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
        assert.strictEqual(eventSourceInstance.url, `http://localhost:${port}/redirect`)
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
      assert.strictEqual(eventSourceInstance.url, `http://localhost:${port}/redirect`)
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

  test('Should set origin attribute of messages after redirecting', async () => {
    const targetServer = http.createServer((req, res) => {
      if (res.req.url === '/target') {
        res.writeHead(200, undefined, { 'Content-Type': 'text/event-stream' })
        res.write('event: message\ndata: test\n\n')
      }
    })
    targetServer.listen(0)
    await events.once(targetServer, 'listening')
    const targetPort = targetServer.address().port

    const sourceServer = http.createServer((req, res) => {
      res.writeHead(301, undefined, { Location: `http://127.0.0.1:${targetPort}/target` })
      res.end()
    })
    sourceServer.listen(0)
    await events.once(sourceServer, 'listening')

    const sourcePort = sourceServer.address().port

    const eventSourceInstance = new EventSource(`http://127.0.0.1:${sourcePort}/redirect`)
    eventSourceInstance.onmessage = (event) => {
      assert.strictEqual(event.origin, `http://127.0.0.1:${targetPort}`)
      eventSourceInstance.close()
      targetServer.close()
      sourceServer.close()
    }
    eventSourceInstance.onerror = (e) => {
      assert.fail('Should not have errored')
    }
  })
})
