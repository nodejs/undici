'use strict'

const { once } = require('node:events')
const http = require('node:http')
const { test, describe, after } = require('node:test')
const { setImmediate } = require('node:timers/promises')
const { Agent } = require('../..')
const { EventSource } = require('../../lib/web/eventsource/eventsource')

describe('EventSource - close', () => {
  for (const waitForRequest of [false, true]) {
    test(`should not emit events when closed ${waitForRequest ? 'before response headers' : 'immediately'}`, { timeout: 5000 }, async (t) => {
      const server = http.createServer()
      await once(server.listen(0, '127.0.0.1'), 'listening')
      const requestReceived = waitForRequest ? once(server, 'request') : null
      const agent = new Agent()
      const source = new EventSource(`http://127.0.0.1:${server.address().port}`, {
        dispatcher: agent
      })
      t.after(async () => {
        source.close()
        server.closeAllConnections()
        server.close()
        await agent.destroy()
      })

      const events = []
      for (const type of ['open', 'message', 'error']) {
        source.addEventListener(type, () => events.push(type))
      }

      if (requestReceived) await requestReceived
      source.close()
      await setImmediate()
      await setImmediate()

      t.assert.strictEqual(source.readyState, EventSource.CLOSED)
      t.assert.deepStrictEqual(events, [])
    })
  }

  for (const closeOn of ['open', 'message', 'custom']) {
    test(`should not dispatch buffered events after closing from ${closeOn}`, { timeout: 5000 }, async (t) => {
      const { promise: disconnected, resolve } = Promise.withResolvers()
      const server = http.createServer((req, res) => {
        res.on('close', resolve)
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        res.write('data: first\n\nevent: custom\ndata: second\n\ndata: third\n\n')
      })
      await once(server.listen(0, '127.0.0.1'), 'listening')
      const agent = new Agent()
      const source = new EventSource(`http://127.0.0.1:${server.address().port}`, {
        dispatcher: agent
      })
      t.after(async () => {
        source.close()
        server.closeAllConnections()
        server.close()
        await agent.destroy()
      })

      const events = []
      source.onopen = () => {
        events.push('open')
        if (closeOn === 'open') source.close()
      }
      for (const type of ['message', 'custom']) {
        source.addEventListener(type, (event) => {
          events.push(`${event.type}:${event.data}`)
          if (closeOn === event.type) source.close()
        })
      }
      source.onerror = () => events.push('error')

      await disconnected
      await setImmediate()

      const expected = ['open']
      if (closeOn !== 'open') expected.push('message:first')
      if (closeOn === 'custom') expected.push('custom:second')
      t.assert.deepStrictEqual(events, expected)
      t.assert.strictEqual(source.readyState, EventSource.CLOSED)
    })
  }

  for (const closeOnMessage of [false, true]) {
    test(`should ${closeOnMessage ? 'ignore a parser error after close' : 'report a parser error while open'}`, { timeout: 5000 }, async (t) => {
      const { promise: disconnected, resolve } = Promise.withResolvers()
      const server = http.createServer((req, res) => {
        res.on('close', resolve)
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        res.write(`data: ok\n\ndata: ${'x'.repeat(100)}\n\n`)
      })
      await once(server.listen(0, '127.0.0.1'), 'listening')
      const agent = new Agent({ eventSource: { maxEventSize: 16 } })
      const source = new EventSource(`http://127.0.0.1:${server.address().port}`, {
        dispatcher: agent
      })
      t.after(async () => {
        source.close()
        server.closeAllConnections()
        server.close()
        await agent.destroy()
      })

      const events = []
      source.onmessage = (event) => {
        events.push(event.data)
        if (closeOnMessage) source.close()
      }
      source.onerror = () => events.push('error')

      await disconnected
      await setImmediate()

      t.assert.deepStrictEqual(events, closeOnMessage ? ['ok'] : ['ok', 'error'])
      t.assert.strictEqual(source.readyState, EventSource.CLOSED)
    })
  }

  test('should not emit error when closing the EventSource Instance', async (t) => {
    t.plan(1)

    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      t.assert.strictEqual(req.headers.connection, 'keep-alive')
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
      t.assert.fail('Should not have errored')
    }

    await once(server, 'close')
  })

  test('should set readyState to CLOSED', async (t) => {
    t.plan(3)
    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      t.assert.strictEqual(req.headers.connection, 'keep-alive')
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.write('data: hello\n\n')
    })
    after(() => server.close())
    await once(server.listen(0), 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = () => {
      t.assert.strictEqual(eventSourceInstance.readyState, EventSource.OPEN)
      eventSourceInstance.close()
      t.assert.strictEqual(eventSourceInstance.readyState, EventSource.CLOSED)
      server.close()
    }

    eventSourceInstance.onerror = () => {
      t.assert.fail('Should not have errored')
    }
    await once(server, 'close')
  })
})
