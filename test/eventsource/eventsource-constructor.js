'use strict'

const { once } = require('node:events')
const http = require('node:http')
const { test, describe } = require('node:test')
const { EventSource } = require('../../lib/web/eventsource/eventsource')

describe('EventSource - withCredentials', () => {
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
