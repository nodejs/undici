'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { fetch } = require('../..')
const { createServer } = require('node:http')
const { once } = require('node:events')

// https://github.com/nodejs/undici/issues/4627
test('fetch with redirect: error can be properly aborted', async (t) => {
  let connectionClosed = false

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    // SSE-like response
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })

    // Send data periodically
    const interval = setInterval(() => {
      if (!res.destroyed) {
        res.write('data: test\n\n')
      }
    }, 50)

    req.on('close', () => {
      connectionClosed = true
      clearInterval(interval)
    })
  })

  await once(server.listen(0), 'listening')

  try {
    const controller = new AbortController()

    const response = await fetch(`http://localhost:${server.address().port}/sse`, {
      signal: controller.signal,
      redirect: 'error'
    })

    assert.strictEqual(response.status, 200)

    // Start consuming the stream
    const reader = response.body.getReader()
    const readPromise = reader.read()

    // Abort after a short delay
    await new Promise(resolve => setTimeout(resolve, 100))
    controller.abort()

    // Verify the abort propagated
    try {
      await readPromise
      assert.fail('Expected read to be aborted')
    } catch (err) {
      assert.ok(err.name === 'AbortError' || err.message.includes('aborted') || err.message.includes('terminated'), 'Read was aborted')
    }

    // Give the server time to detect the closed connection
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify the connection was actually closed on the server side
    assert.ok(connectionClosed, 'Connection should be closed on server side')
  } finally {
    server.close()
  }
})

test('fetch with redirect: error and window: no-window can be properly aborted', async (t) => {
  let connectionClosed = false

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })

    const interval = setInterval(() => {
      if (!res.destroyed) {
        res.write('data: test\n\n')
      }
    }, 50)

    req.on('close', () => {
      connectionClosed = true
      clearInterval(interval)
    })
  })

  await once(server.listen(0), 'listening')

  try {
    const controller = new AbortController()

    // This mimics how EventSource polyfill might call fetch
    const response = await fetch(`http://localhost:${server.address().port}/sse`, {
      signal: controller.signal,
      redirect: 'error',
      window: null // This makes request.window become 'no-window'
    })

    assert.strictEqual(response.status, 200)

    const reader = response.body.getReader()
    const readPromise = reader.read()

    await new Promise(resolve => setTimeout(resolve, 100))
    controller.abort()

    try {
      await readPromise
      assert.fail('Expected read to be aborted')
    } catch (err) {
      assert.ok(err.name === 'AbortError' || err.message.includes('aborted') || err.message.includes('terminated'), 'Read was aborted')
    }

    await new Promise(resolve => setTimeout(resolve, 100))

    assert.ok(connectionClosed, 'Connection should be closed on server side')
  } finally {
    server.close()
  }
})

test('multiple sequential fetches with redirect: error are properly cleaned up', async (t) => {
  const connections = []

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    const conn = { closed: false }
    connections.push(conn)

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })

    const interval = setInterval(() => {
      if (!res.destroyed) {
        res.write('data: test\n\n')
      }
    }, 50)

    req.on('close', () => {
      conn.closed = true
      clearInterval(interval)
    })
  })

  await once(server.listen(0), 'listening')

  try {
    // Create multiple connections
    for (let i = 0; i < 3; i++) {
      const controller = new AbortController()

      const response = await fetch(`http://localhost:${server.address().port}/sse`, {
        signal: controller.signal,
        redirect: 'error'
      })

      assert.strictEqual(response.status, 200)

      // Start reading
      const reader = response.body.getReader()
      reader.read().catch(() => {}) // Ignore abort errors

      // Abort after a short delay
      await new Promise(resolve => setTimeout(resolve, 100))
      controller.abort()
    }

    // Give time for all connections to close
    await new Promise(resolve => setTimeout(resolve, 100))

    // All connections should be closed
    assert.strictEqual(connections.length, 3, 'Should have 3 connections')
    assert.ok(connections.every(c => c.closed), 'All connections should be closed')
  } finally {
    server.close()
  }
})
