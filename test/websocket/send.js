'use strict'

const { once } = require('node:events')
const { test, describe } = require('node:test')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

async function closeWebSocket (ws) {
  if (ws.readyState === WebSocket.CLOSED) {
    return
  }

  const close = once(ws, 'close')
  ws.close()
  await close
}

async function closeWebSocketServer (server) {
  for (const client of server.clients) {
    client.terminate()
  }

  await new Promise((resolve) => server.close(resolve))
}

function registerCleanup (t, ws, server) {
  t.after(async () => {
    await Promise.allSettled([
      closeWebSocket(ws),
      closeWebSocketServer(server)
    ])
  })
}

// the following three tests exercise different code paths because of the three
// different ways a payload length may be specified in a WebSocket frame
// (https://datatracker.ietf.org/doc/html/rfc6455#section-5.2)

test('Sending >= 2^16 bytes', async (t) => {
  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (socket) => {
    socket.on('message', (message, isBinary) => {
      socket.send(message, { binary: isBinary })
    })
  })

  const payload = Buffer.allocUnsafe(2 ** 16).fill('Hello')

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)
  registerCleanup(t, ws, server)

  await once(ws, 'open')
  ws.send(payload)

  const [{ data }] = await once(ws, 'message')

  t.assert.ok(data instanceof Blob)
  t.assert.strictEqual(data.size, payload.length)
  t.assert.deepStrictEqual(Buffer.from(await data.arrayBuffer()), payload)
})

test('Sending >= 126, < 2^16 bytes', async (t) => {
  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (socket) => {
    socket.on('message', (message, isBinary) => {
      socket.send(message, { binary: isBinary })
    })
  })

  const payload = Buffer.allocUnsafe(126).fill('Hello')

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)
  registerCleanup(t, ws, server)

  await once(ws, 'open')
  ws.send(payload)

  const [{ data }] = await once(ws, 'message')

  t.assert.ok(data instanceof Blob)
  t.assert.strictEqual(data.size, payload.length)
  t.assert.deepStrictEqual(Buffer.from(await data.arrayBuffer()), payload)
})

test('Sending < 126 bytes', async (t) => {
  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (socket) => {
    socket.on('message', (message, isBinary) => {
      socket.send(message, { binary: isBinary })
    })
  })

  const payload = Buffer.allocUnsafe(125).fill('Hello')

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)
  registerCleanup(t, ws, server)

  await once(ws, 'open')
  ws.send(payload)

  const [{ data }] = await once(ws, 'message')

  t.assert.ok(data instanceof Blob)
  t.assert.strictEqual(data.size, payload.length)
  t.assert.deepStrictEqual(Buffer.from(await data.arrayBuffer()), payload)
})

test('Sending data after close', async (t) => {
  const server = new WebSocketServer({ port: 0 })
  const ws = new WebSocket(`ws://localhost:${server.address().port}`)
  registerCleanup(t, ws, server)

  const connection = once(server, 'connection')

  await once(ws, 'open')

  const [socket] = await connection
  socket.on('message', () => {
    t.assert.fail('Received unexpected message after closing the client')
  })

  ws.close()
  ws.send('Some message')

  await Promise.all([
    once(ws, 'close'),
    once(socket, 'close')
  ])
})

test('Sending data before connected', (t) => {
  const server = new WebSocketServer({ port: 0 })
  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  registerCleanup(t, ws, server)

  t.assert.throws(
    () => ws.send('Not sent'),
    {
      name: 'InvalidStateError',
      constructor: DOMException
    }
  )

  t.assert.strictEqual(ws.readyState, WebSocket.CONNECTING)
})

describe('Sending data to a server', () => {
  test('Send with string', async (t) => {
    const server = new WebSocketServer({ port: 0 })
    const ws = new WebSocket(`ws://localhost:${server.address().port}`)
    registerCleanup(t, ws, server)

    const connection = once(server, 'connection')

    await once(ws, 'open')
    ws.send('message')

    const [socket] = await connection
    const [data, isBinary] = await once(socket, 'message')

    t.assert.ok(!isBinary, 'Received text frame')
    t.assert.deepStrictEqual(data, Buffer.from('message'))
  })

  test('Send with ArrayBuffer', async (t) => {
    const message = new TextEncoder().encode('message')
    const ab = new ArrayBuffer(7)
    new Uint8Array(ab).set(message)

    const server = new WebSocketServer({ port: 0 })
    const ws = new WebSocket(`ws://localhost:${server.address().port}`)
    registerCleanup(t, ws, server)

    const connection = once(server, 'connection')

    await once(ws, 'open')
    ws.send(ab)

    const [socket] = await connection
    const [data, isBinary] = await once(socket, 'message')

    t.assert.ok(isBinary)
    t.assert.deepStrictEqual(new Uint8Array(data), message)
  })

  test('Send with Blob', async (t) => {
    const blob = new Blob(['hello'])
    const server = new WebSocketServer({ port: 0 })
    const ws = new WebSocket(`ws://localhost:${server.address().port}`)
    registerCleanup(t, ws, server)

    const connection = once(server, 'connection')

    await once(ws, 'open')
    ws.send(blob)

    const [socket] = await connection
    const [data, isBinary] = await once(socket, 'message')

    t.assert.ok(isBinary)
    t.assert.deepStrictEqual(data, Buffer.from('hello'))
  })

  test('Cannot send with SharedArrayBuffer', async (t) => {
    const sab = new SharedArrayBuffer(0)
    const server = new WebSocketServer({ port: 0 })
    const ws = new WebSocket(`ws://localhost:${server.address().port}`)
    registerCleanup(t, ws, server)

    const connection = once(server, 'connection')

    await once(ws, 'open')
    ws.send(sab)

    const [socket] = await connection
    const [data, isBinary] = await once(socket, 'message')

    t.assert.ok(!isBinary)
    t.assert.deepStrictEqual(data, Buffer.from('[object SharedArrayBuffer]'))
  })
})
