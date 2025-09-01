'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { once } = require('node:events')
const http = require('node:http')
const { test, describe, after } = require('node:test')
const { EventSource } = require('../../lib/web/eventsource/eventsource')

describe('EventSource - close', () => {
  test('should not emit error when closing the EventSource Instance', async (t) => {
    t = tspl(t, { plan: 1 })

    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      t.strictEqual(req.headers.connection, 'keep-alive')
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('data: hello\n\n')

      res.on('close', () => {
        server.close()
      })
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = () => {
      eventSourceInstance.close()
    }

    eventSourceInstance.onerror = () => {
      t.fail('Should not have errored')
    }

    await t.completed
  })

  test('should set readyState to CLOSED', async (t) => {
    t = tspl(t, { plan: 3 })
    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      t.strictEqual(req.headers.connection, 'keep-alive')
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('data: hello\n\n')
    })

    after(() => server.close())
    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = () => {
      t.strictEqual(eventSourceInstance.readyState, EventSource.OPEN)
      eventSourceInstance.close()
      t.strictEqual(eventSourceInstance.readyState, EventSource.CLOSED)
    }

    eventSourceInstance.onerror = () => {
      t.fail('Should not have errored')
    }

    await t.completed
  })
})
