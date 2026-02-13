'use strict'

// Regression test for https://github.com/nodejs/undici/issues/4627
// Fetch abort may not take effect when fetch init.redirect = 'error'
// causing SSE connection leak

const { test } = require('node:test')
const { fetch } = require('../..')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { closeServerAsPromise } = require('../utils/node-http')

// This test requires --expose-gc flag
const hasGC = typeof global.gc === 'function'

test('abort should work with redirect: error', { skip: !hasGC, timeout: 3000 }, async (t) => {
  let connectionClosed = false
  let messagesReceivedAfterAbort = 0

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })

    // Send data every 20ms for faster test
    const interval = setInterval(() => {
      res.write(`data: ${Date.now()}\n\n`)
    }, 20)

    res.on('close', () => {
      connectionClosed = true
      clearInterval(interval)
    })
  })

  t.after(closeServerAsPromise(server))
  await once(server.listen(0), 'listening')
  const port = server.address().port

  const ac = new AbortController()

  const response = await fetch(`http://localhost:${port}/sse`, {
    signal: ac.signal,
    redirect: 'error'
  })

  let aborted = false

  // Start reading the stream in background
  const readPromise = (async () => {
    try {
      const reader = response.body.getReader()
      while (true) {
        const { done } = await reader.read()
        if (done) break

        if (aborted) {
          messagesReceivedAfterAbort++
          if (messagesReceivedAfterAbort >= 3) {
            // Bug confirmed - received multiple messages after abort
            reader.cancel()
            break
          }
        }
      }
    } catch (err) {
      // AbortError is expected
      if (err.name !== 'AbortError' && err.message !== 'aborted' && !err.message?.includes('cancel')) {
        throw err
      }
    }
  })()

  // Wait for some data to be received
  await new Promise(resolve => setTimeout(resolve, 100))

  // Trigger GC to potentially collect the AbortController
  global.gc()

  // Abort the request
  aborted = true
  ac.abort()

  // Wait for the read to complete or timeout
  const timeout = new Promise((_resolve, reject) =>
    setTimeout(() => reject(new Error('Read did not complete in time')), 1000)
  )

  try {
    await Promise.race([readPromise, timeout])
  } catch (e) {
    // If timed out, that's also a bug indication
    if (e.message === 'Read did not complete in time') {
      messagesReceivedAfterAbort = 999 // Force failure
    } else {
      throw e
    }
  }

  t.assert.strictEqual(messagesReceivedAfterAbort, 0, 'No data should be received after abort')

  // Give some time for the connection to close
  await new Promise(resolve => setTimeout(resolve, 100))

  t.assert.ok(connectionClosed, 'Server connection should be closed after abort')
})

test('abort should work without redirect: error (control test)', { skip: !hasGC, timeout: 3000 }, async (t) => {
  let connectionClosed = false
  let messagesReceivedAfterAbort = 0

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })

    // Send data every 20ms
    const interval = setInterval(() => {
      res.write(`data: ${Date.now()}\n\n`)
    }, 20)

    res.on('close', () => {
      connectionClosed = true
      clearInterval(interval)
    })
  })

  t.after(closeServerAsPromise(server))
  await once(server.listen(0), 'listening')
  const port = server.address().port

  const ac = new AbortController()

  // Without redirect: 'error' - this should work correctly
  const response = await fetch(`http://localhost:${port}/sse`, {
    signal: ac.signal
  })

  let aborted = false

  // Start reading the stream in background
  const readPromise = (async () => {
    try {
      const reader = response.body.getReader()
      while (true) {
        const { done } = await reader.read()
        if (done) break

        if (aborted) {
          messagesReceivedAfterAbort++
          if (messagesReceivedAfterAbort >= 3) {
            reader.cancel()
            break
          }
        }
      }
    } catch (err) {
      // AbortError is expected
      if (err.name !== 'AbortError' && err.message !== 'aborted' && !err.message?.includes('cancel')) {
        throw err
      }
    }
  })()

  // Wait for some data to be received
  await new Promise(resolve => setTimeout(resolve, 100))

  // Trigger GC
  global.gc()

  // Abort the request
  aborted = true
  ac.abort()

  // Wait for the read to complete
  await readPromise

  // Give some time for the connection to close
  await new Promise(resolve => setTimeout(resolve, 100))

  t.assert.strictEqual(messagesReceivedAfterAbort, 0, 'No data should be received after abort')
  t.assert.ok(connectionClosed, 'Server connection should be closed after abort')
})
