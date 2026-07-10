'use strict'

const { test } = require('node:test')
const net = require('node:net')
const { WebSocketServer } = require('ws')

const { WebSocketStream } = require('../../..')

function waitFor (predicate) {
  return new Promise((resolve, reject) => {
    const started = Date.now()

    const check = () => {
      if (predicate()) {
        resolve()
      } else if (Date.now() - started > 1000) {
        reject(new Error('timed out waiting for condition'))
      } else {
        setTimeout(check, 10)
      }
    }

    check()
  })
}

// These tests assert that `closed` does NOT hang - if it regresses, the
// point of the test is defeated by also hanging (up to the runner's own
// timeout) instead of failing fast with a clear message.
function withTimeout (promise, ms, message) {
  let timer
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

test('WebSocketStream applies receive backpressure to the socket', async (t) => {
  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (socket) => {
    socket.send('one')
  })

  const { port } = server.address()
  const originalPause = net.Socket.prototype.pause
  const originalResume = net.Socket.prototype.resume
  let pauseCount = 0
  let resumeCount = 0

  net.Socket.prototype.pause = function (...args) {
    if (this.remotePort === port) {
      pauseCount++
    }

    return originalPause.apply(this, args)
  }

  net.Socket.prototype.resume = function (...args) {
    if (this.remotePort === port) {
      resumeCount++
    }

    return originalResume.apply(this, args)
  }

  t.after(() => {
    net.Socket.prototype.pause = originalPause
    net.Socket.prototype.resume = originalResume

    for (const client of server.clients) {
      client.terminate()
    }

    server.close()
  })

  const stream = new WebSocketStream(`ws://127.0.0.1:${port}`)
  const { readable } = await stream.opened

  await waitFor(() => pauseCount > 0)

  const resumesBeforeRead = resumeCount
  const reader = readable.getReader()
  const first = await reader.read()

  t.assert.deepStrictEqual(first, { done: false, value: 'one' })

  await waitFor(() => resumeCount > resumesBeforeRead)

  await reader.cancel()
  await stream.closed.catch(() => {})
})

test('WebSocketStream#close resolves closed even while the socket is paused for receive backpressure', async (t) => {
  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (socket) => {
    socket.send('one')
    socket.send('two')
  })

  const { port } = server.address()
  const originalPause = net.Socket.prototype.pause
  let pauseCount = 0

  net.Socket.prototype.pause = function (...args) {
    if (this.remotePort === port) {
      pauseCount++
    }

    return originalPause.apply(this, args)
  }

  t.after(() => {
    net.Socket.prototype.pause = originalPause

    for (const client of server.clients) {
      client.terminate()
    }

    server.close()
  })

  const stream = new WebSocketStream(`ws://127.0.0.1:${port}`)
  await stream.opened

  // Never read from `readable` - wait until the unread backlog has actually
  // paused the socket (desiredSize <= 0) before closing, otherwise closing
  // before the messages even arrive wouldn't exercise the paused-socket
  // path at all. Closing must still complete: it needs to read the peer's
  // own Close frame off that same paused socket.
  await waitFor(() => pauseCount > 0)
  stream.close()

  const result = await withTimeout(stream.closed, 2000, 'stream.closed hung after close() with an unread backlog')
  t.assert.strictEqual(result.closeCode, 1005)
})

test('WebSocketStream reader#cancel resolves closed even while the socket is paused for receive backpressure', async (t) => {
  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (socket) => {
    socket.send('one')
    socket.send('two')
  })

  const { port } = server.address()

  t.after(() => {
    for (const client of server.clients) {
      client.terminate()
    }

    server.close()
  })

  const stream = new WebSocketStream(`ws://127.0.0.1:${port}`)
  const { readable } = await stream.opened
  const reader = readable.getReader()

  // Read the first message so the reader is locked and has seen data, then
  // leave the second one unread - the socket stays paused. Cancelling must
  // still complete rather than hang waiting for the peer's Close frame.
  await reader.read()
  await reader.cancel()

  const result = await withTimeout(stream.closed, 2000, 'stream.closed hung after reader.cancel() with an unread backlog')
  t.assert.strictEqual(result.closeCode, 1005)
})
