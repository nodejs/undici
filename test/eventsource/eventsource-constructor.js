'use strict'

const { once } = require('node:events')
const http = require('node:http')
const { test, describe } = require('node:test')
const { EventSource } = require('../../lib/web/eventsource/eventsource')
const { Agent } = require('../..')

describe('EventSource - withCredentials', () => {
  test('dispatcher eventSource.maxEventSize closes the connection when exceeded', async (t) => {
    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      setImmediate(() => {
        res.write('data: hello\n')
        res.write('data: world\n')
      })
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const agent = new Agent({
      eventSource: {
        maxEventSize: 5
      }
    })
    const eventSourceInstance = new EventSource(`http://localhost:${port}`, {
      node: {
        dispatcher: agent
      }
    })
    t.after(async () => {
      eventSourceInstance.close()
      server.close()
      await agent.close()
    })

    await once(eventSourceInstance, 'open')
    await once(eventSourceInstance, 'error', { signal: AbortSignal.timeout(1000) })

    t.assert.strictEqual(eventSourceInstance.readyState, EventSource.CLOSED)
  })

  test('withCredentials should be false by default', async (t) => {
    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = () => {
      t.assert.strictEqual(eventSourceInstance.withCredentials, false)
      eventSourceInstance.close()
      server.close()
    }

    eventSourceInstance.onerror = () => {
      t.assert.fail('Should not have errored')
    }
  })

  test('withCredentials can be set to true', async (t) => {
    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`, { withCredentials: true })
    eventSourceInstance.onopen = () => {
      t.assert.strictEqual(eventSourceInstance.withCredentials, true)
      eventSourceInstance.close()
      server.close()
    }

    eventSourceInstance.onerror = () => {
      t.assert.fail('Should not have errored')
    }
  })
})
