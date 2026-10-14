'use strict'

const assert = require('node:assert')
const events = require('node:events')
const { once } = require('node:events')
const http = require('node:http')
const { gzipSync } = require('node:zlib')
const { test, describe } = require('node:test')
const { EventSource } = require('../../lib/web/eventsource/eventsource')
const { Agent } = require('../..')

describe('EventSource - withCredentials', () => {
  test('compressed unfinished SSE line exceeds decoded event limit', async (t) => {
    let response
    const server = http.createServer((req, res) => {
      response = res
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Content-Encoding': 'gzip'
      })
      res.flushHeaders()
    })
    await once(server.listen(0, '127.0.0.1'), 'listening')

    const agent = new Agent({
      eventSource: { maxEventSize: 1024 },
      maxResponseSize: 65536
    })
    const source = new EventSource(`http://127.0.0.1:${server.address().port}`, {
      dispatcher: agent
    })
    t.after(async () => {
      source.close()
      server.closeAllConnections()
      server.close()
      await agent.close()
    })

    let errors = 0
    let messages = 0
    source.addEventListener('error', () => { errors++ })
    source.addEventListener('message', () => { messages++ })
    await once(source, 'open', { signal: AbortSignal.timeout(2000) })
    response.write(gzipSync(Buffer.from(`data: ${'A'.repeat(4096)}`)))
    await once(source, 'error', { signal: AbortSignal.timeout(2000) })

    assert.strictEqual(source.readyState, EventSource.CLOSED)
    assert.strictEqual(errors, 1)
    assert.strictEqual(messages, 0)
  })

  test('compressed tiny SSE fields close at the parser item limit', async (t) => {
    let response
    const server = http.createServer((req, res) => {
      response = res
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Content-Encoding': 'gzip'
      })
      res.flushHeaders()
    })
    await once(server.listen(0, '127.0.0.1'), 'listening')

    const maxResponseSize = 256 * 1024
    const agent = new Agent({
      eventSource: { maxEventSize: 8 * 1024 * 1024 },
      maxResponseSize
    })
    const source = new EventSource(`http://127.0.0.1:${server.address().port}`, {
      dispatcher: agent
    })
    t.after(async () => {
      source.close()
      server.closeAllConnections()
      server.close()
      await agent.close()
    })

    let errors = 0
    let messages = 0
    source.addEventListener('error', () => { errors++ })
    source.addEventListener('message', () => { messages++ })
    await once(source, 'open', { signal: AbortSignal.timeout(2000) })
    const decoded = Buffer.from('data:\n'.repeat(65537))
    const encoded = gzipSync(decoded)
    assert.ok(encoded.length < maxResponseSize)
    assert.ok(decoded.length > maxResponseSize)
    response.write(encoded)
    await once(source, 'error', { signal: AbortSignal.timeout(2000) })

    assert.strictEqual(source.readyState, EventSource.CLOSED)
    assert.strictEqual(errors, 1)
    assert.strictEqual(messages, 0)
  })

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
      dispatcher: agent
    })
    t.after(async () => {
      eventSourceInstance.close()
      server.close()
      await agent.close()
    })

    await once(eventSourceInstance, 'open')
    await once(eventSourceInstance, 'error', { signal: AbortSignal.timeout(1000) })

    assert.strictEqual(eventSourceInstance.readyState, EventSource.CLOSED)
  })

  test('dispatcher eventSource.maxEventSize closes the connection on an unterminated data line', async (t) => {
    const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      // A data field that never contains a line terminator must not bypass the
      // configured maxEventSize and drive the client toward memory exhaustion.
      res.write('data: 123456789a123456789a')
    })

    await once(server.listen(0), 'listening')
    const port = server.address().port

    const agent = new Agent({
      eventSource: {
        maxEventSize: 10
      }
    })
    const eventSourceInstance = new EventSource(`http://localhost:${port}`, {
      dispatcher: agent
    })
    t.after(async () => {
      eventSourceInstance.close()
      server.close()
      await agent.close()
    })

    await once(eventSourceInstance, 'open')
    await once(eventSourceInstance, 'error', { signal: AbortSignal.timeout(1000) })

    assert.strictEqual(eventSourceInstance.readyState, EventSource.CLOSED)
  })

  test('withCredentials should be false by default', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`)
    eventSourceInstance.onopen = () => {
      assert.strictEqual(eventSourceInstance.withCredentials, false)
      eventSourceInstance.close()
      server.close()
    }

    eventSourceInstance.onerror = () => {
      assert.fail('Should not have errored')
    }
  })

  test('withCredentials can be set to true', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, 'OK', { 'Content-Type': 'text/event-stream' })
      res.end()
    })

    server.listen(0)
    await events.once(server, 'listening')
    const port = server.address().port

    const eventSourceInstance = new EventSource(`http://localhost:${port}`, { withCredentials: true })
    eventSourceInstance.onopen = () => {
      assert.strictEqual(eventSourceInstance.withCredentials, true)
      eventSourceInstance.close()
      server.close()
    }

    eventSourceInstance.onerror = () => {
      assert.fail('Should not have errored')
    }
  })
})
