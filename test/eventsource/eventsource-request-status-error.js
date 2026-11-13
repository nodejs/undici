'use strict'

const { once } = require('node:events')
const http = require('node:http')
const { test, describe } = require('node:test')
const { EventSource } = require('../../lib/web/eventsource/eventsource')

describe('EventSource - status error', () => {
  [204, 205, 210, 299, 404, 410, 503].forEach((statusCode) => {
    test(`Should error on ${statusCode} status code`, async (t) => {
      const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
        res.writeHead(statusCode, 'dummy', { 'Content-Type': 'text/event-stream' })
        res.end()
      })

      await once(server.listen(0), 'listening')
      const port = server.address().port

      const eventSourceInstance = new EventSource(`http://localhost:${port}`)
      eventSourceInstance.onerror = (e) => {
        t.assert.strictEqual(this.readyState, this.CLOSED)
        eventSourceInstance.close()
        server.close()
      }
      eventSourceInstance.onmessage = () => {
        t.assert.fail('Should not have received a message')
      }
      eventSourceInstance.onopen = () => {
        t.assert.fail('Should not have opened')
      }
    })
  })
})

test('EventSource error handlers receive a plain Event', async (t) => {
  const server = http.createServer((req, res) => res.writeHead(404).end())
  t.after(() => server.close())
  await once(server.listen(0, '127.0.0.1'), 'listening')

  const source = new EventSource(`http://127.0.0.1:${server.address().port}`)
  t.after(() => source.close())
  let callbackEvent
  source.onerror = (event) => { callbackEvent = event }
  const [event] = await once(source, 'error')

  t.assert.strictEqual(event.constructor, Event)
  t.assert.strictEqual(callbackEvent, event)
  t.assert.strictEqual('message' in event, false)
})
